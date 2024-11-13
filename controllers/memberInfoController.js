const database = require("../database/database");
const jwt = require("jsonwebtoken");

// JWT를 사용해 로그인 상태를 확인하는 미들웨어
// const verifyInfoToken = (req, res, next) => {
//   const token = req.cookies.token;
//   if (!token) return res.status(401).json({ message: 'Unauthorized' });

//   jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
//     if (err)
//       return res.status(401).json({ message: 'Token is invalid or expired' });
//     req.user = decoded; // 인증된 사용자 정보 저장
//     next();
//   });
// };

const verifyInfoToken = (req, res, next) => {
  const token = req.cookies.token || req.headers["authorization"];

  if (!token) {
    console.error("No token provided");
    return res.status(401).json({ message: "Unauthorized" });
  }

  const actualToken = token.startsWith("Bearer ") ? token.split(" ")[1] : token;

  jwt.verify(actualToken, process.env.SECRET_KEY, (err, decoded) => {
    if (err) {
      console.error("Token verification failed:", err);
      return res.status(401).json({ message: "Token is invalid or expired" });
    }
    req.user = decoded; // 인증된 사용자 정보 저장
    console.log("Token decoded successfully:", decoded);
    next();
  });
};

//====================특정 회원 정보를 조회======================
const getMemberInfo = async (req, res) => {
  try {
    const member_num = req.user.memberNum; // 인증된 사용자 ID 가져오기

    const query = `
      SELECT 
          member_num,
          member_id,
          member_email,
          member_phone,
          member_gender,
          member_nickname,
          TO_CHAR(member_birth_date, 'YYYY.MM.DD') AS member_birth_date,
          member_status,
          member_join_date,
          member_leave_date,
          marketing_consent
      FROM member
      WHERE member_num = $1;
    `;

    const result = await database.query(query, [member_num]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Member not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching member info:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

//====================회원 닉네임 변경 이력 조회======================
const getMemberNicknames = async (req, res) => {
  try {
    const { member_num } = req.params;

    const query = `
      SELECT 
          new_nickname,
          TO_CHAR(change_date, 'YYYY.MM.DD HH24:MI') AS change_date
      FROM member_nickname
      WHERE member_num = $1
      ORDER BY change_date DESC;
    `;

    const result = await database.query(query, [member_num]);

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No nickname change history found for this member" });
    }

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching nickname change history:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

//====================회원 정보 수정======================
const updateMemberInfo = async (req, res) => {
  try {
    const { member_num } = req.params;
    const { member_email, member_phone, member_nickname, marketing_consent } =
      req.body;

    // 1. 이메일 유효성 검사
    if (
      !member_email ||
      !member_email.includes("@") ||
      /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(member_email)
    ) {
      return res.status(400).json({
        message: "Invalid email format or Korean characters detected",
      });
    }

    // 2. 이메일 중복 검사
    const checkEmailQuery = `
      SELECT member_email 
      FROM member 
      WHERE member_email = $1 AND member_num != $2;
    `;
    const checkEmailResult = await database.query(checkEmailQuery, [
      member_email,
      member_num,
    ]);
    if (checkEmailResult.rows.length > 0) {
      return res.status(400).json({ message: "Email is already in use" });
    }

    // 3. 닉네임 유효성 검사
    if (
      !member_nickname ||
      member_nickname.length < 1 ||
      member_nickname.length > 20
    ) {
      return res
        .status(400)
        .json({ message: "Nickname must be between 1 and 20 characters" });
    }

    // 4. 연락처 유효성 검사
    if (
      !member_phone ||
      member_phone.length !== 11 ||
      !member_phone.startsWith("010")
    ) {
      return res
        .status(400)
        .json({ message: "Phone number must be 11 digits and start with 010" });
    }

    const getCurrentNicknameQuery = `
      SELECT member_nickname
      FROM member
      WHERE member_num = $1;
    `;
    const currentNicknameResult = await database.query(
      getCurrentNicknameQuery,
      [member_num]
    );

    if (currentNicknameResult.rows.length === 0) {
      return res.status(404).json({ message: "Member not found" });
    }

    const currentNickname = currentNicknameResult.rows[0].member_nickname;

    // 회원 정보 업데이트 쿼리
    const updateQuery = `
      UPDATE member
      SET 
        member_email = COALESCE($1, member_email),
        member_phone = COALESCE($2, member_phone),
        member_nickname = COALESCE($3, member_nickname),
        marketing_consent = COALESCE($4, marketing_consent)
      WHERE member_num = $5
      RETURNING member_num, member_id, member_email, member_phone, member_nickname, marketing_consent;
    `;

    const updateValues = [
      member_email,
      member_phone,
      member_nickname,
      marketing_consent,
      member_num,
    ];

    const updateResult = await database.query(updateQuery, updateValues);

    if (updateResult.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Member not found or no changes made" });
    }

    // 닉네임이 변경된 경우 member_nickname 테이블에 이력을 추가합니다.
    if (member_nickname && member_nickname !== currentNickname) {
      const nicknameChangeQuery = `
        INSERT INTO member_nickname (member_num, new_nickname, change_date)
        VALUES ($1, $2, NOW());
      `;
      await database.query(nicknameChangeQuery, [member_num, member_nickname]);
    }

    // 수정된 회원 정보 반환
    res.status(200).json({
      message: "Member information updated successfully",
      data: updateResult.rows[0],
    });
  } catch (error) {
    console.error("Error updating member info:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// =====================================================

// + 회원 탈퇴 함수 호출 시 thread_main 테이블에서, 현재 thread 테이블에 존재하지 않는 thread_num을 참조하는 댓글과 대댓글을 삭제합니다. thread_num이 thread 테이블에 없는 경우, 해당 thread_num을 가진 thread_main 테이블의 모든 행을 삭제합니다. (소프트 삭제 아님)

// 부모 댓글 상태가 True인 것이 하나도 없을 경우 스레드는 바로 삭제되는데 댓글 및 대댓글은 소프트 삭제 처리만 되다 보니 테스트 하면서 댓글 및 대댓글 데이터가 DB에 너무 많이 쌓여서 만든 함수입니다.

// 소프트 삭제 처리된 데이터(즉, thread_main의 thread_status가 false인 데이터)는 여전히 thread 테이블에 thread_num이 존재하면 삭제되지 않습니다.

// 존재하지 않는 스레드의 댓글 및 대댓글을 삭제하는 함수
const cleanUpThreads = async () => {
  try {
    const deleteOrphanedCommentsQuery = `
      DELETE FROM thread_main
      WHERE thread_num NOT IN (SELECT thread_num FROM thread)
    `;

    const result = await database.query(deleteOrphanedCommentsQuery);
    console.log("Deleted orphaned comments:", result.rowCount);
  } catch (error) {
    console.error("Error cleaning up orphaned comments:", error);
  }
};

//====================회원 탈퇴======================
const deleteMembership = async (req, res) => {
  try {
    // const member_num = req.user.memberNum;
    const member_num = req.params.member_num; // 인증된 사용자 ID 가져오기
    console.log("Received DELETE request for member:", req.params.member_num);

    // 회원 상태가 이미 inactive인지 확인
    const checkQuery = `
      SELECT member_status 
      FROM member
      WHERE member_num = $1;
    `;
    const checkResult = await database.query(checkQuery, [member_num]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: "Member not found" });
    }

    if (checkResult.rows[0].member_status === "inactive") {
      return res.status(400).json({ message: "Member is already deactivated" });
    }

    // 연결된 테이블들 상태를 각각 업데이트 (book_review, community, community_comment, thread_main)
    const updateBookReviewQuery = `
      UPDATE book_review SET review_status = 'inactive' WHERE member_num = $1;
    `;
    const updateCommunityQuery = `
      UPDATE community SET post_status = 'deleted' WHERE member_num = $1;
    `;
    const updateCommunityCommentQuery = `
      UPDATE community_comment SET comment_status = 'deleted' WHERE member_num = $1;
    `;
    const updateThreadMainQuery = `
      UPDATE thread_main SET thread_status = 'false' WHERE member_num = $1;
    `;

    await database.query(updateBookReviewQuery, [member_num]);
    await database.query(updateCommunityQuery, [member_num]);
    await database.query(updateCommunityCommentQuery, [member_num]);
    await database.query(updateThreadMainQuery, [member_num]);

    // 회원 상태를 inactive로 업데이트 (탈퇴 처리)
    const updateQuery = `
      UPDATE member
      SET member_status = 'inactive',
          member_leave_date = NOW()
      WHERE member_num = $1
      RETURNING member_num, member_status;
    `;
    const updateResult = await database.query(updateQuery, [member_num]);

    if (updateResult.rows.length === 0) {
      return res.status(500).json({ message: "Failed to deactivate member" });
    }

    // 탈퇴 후 토큰 삭제 또는 만료 처리 (로그인 상태 끊기)
    // 예시: (JWT 토큰 삭제는 클라이언트에서 처리해야 함)

    // 존재하지 않는 스레드의 댓글 및 대댓글 정리 (추후에 해당 기능이 필요없다면 이 부분만 삭제하시면 됩니다.)
    await cleanUpThreads();

    // 탈퇴 성공
    res.status(200).json({ message: "Membership successfully deactivated" });
  } catch (error) {
    console.error("Error deactivating membership:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  verifyInfoToken,
  getMemberInfo,
  getMemberNicknames,
  updateMemberInfo,
  deleteMembership,
};
