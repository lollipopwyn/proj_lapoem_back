const pool = require('../database/database'); // database 연결 파일

// 모든 게시글 가져오기
exports.getCommunityPosts = async (req, res) => {
  try {
    // 문자열로 받은 visibility를 불리언으로 변환
    const visibility = req.query.visibility === 'true';
    const member_num = req.query.member_num;

    // 쿼리 로그
    console.log('Visibility parameter received:', visibility);
    console.log('Member number received:', member_num);

    let query = `
      SELECT 
        community.posts_id, 
        community.post_title, 
        community.post_content, 
        community.post_created_at, 
        community.post_status, 
        community.visibility,
        community.member_num,
        member.member_nickname,
        member.member_email
      FROM 
        community
      JOIN 
        member ON community.member_num = member.member_num
      WHERE 
        community.post_deleted_at IS NULL
      AND 
        community.visibility = $1
    `;
    let queryParams = [visibility];

    // Only me 요청일 경우, member_num 추가 필터링
    if (!visibility && member_num) {
      query += ' AND community.member_num = $2';
      queryParams.push(member_num);
    }

    query += ' ORDER BY community.post_created_at DESC';

    const result = await pool.query(query, queryParams);

    console.log('Query result:', result.rows); // 쿼리 결과 로그
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching community posts:', error);
    res.status(500).json({ message: '게시글을 불러오지 못했습니다.' });
  }
};

// 새 게시글 생성하기
exports.createCommunityPost = async (req, res) => {
  const { member_num, post_title, post_content, post_status, visibility } =
    req.body;

  console.log('Received post data on server:', {
    member_num,
    post_title,
    post_content,
    post_status,
    visibility,
  });

  // 유효성 검증
  if (!member_num) {
    console.error('Error: member_num is missing');
    return res
      .status(400)
      .json({ message: '작성자 정보(member_num)가 누락되었습니다.' });
  }
  if (!post_title) {
    console.error('Error: post_title is missing');
    return res.status(400).json({ message: '제목을 입력해야 합니다.' });
  }
  if (!post_content) {
    console.error('Error: post_content is missing');
    return res.status(400).json({ message: '내용을 입력해야 합니다.' });
  }

  // post_status와 visibility 값 검증
  const validStatuses = ['active', 'inactive'];
  if (post_status && !validStatuses.includes(post_status)) {
    console.error(`Error: Invalid post_status value - ${post_status}`);
    return res
      .status(400)
      .json({ message: `유효하지 않은 상태 값입니다: ${post_status}` });
  }

  if (typeof visibility !== 'boolean') {
    console.error(
      `Error: visibility must be true or false, received: ${visibility}`
    );
    return res
      .status(400)
      .json({ message: 'visibility 필드는 true 또는 false여야 합니다.' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO community (member_num, post_title, post_content, post_created_at, post_status, visibility) VALUES ($1, $2, $3, NOW(), $4, $5) RETURNING *',
      [member_num, post_title, post_content, post_status, visibility]
    );

    if (result.rows.length > 0) {
      console.log('Post created successfully:', result.rows[0]);
      return res.status(201).json(result.rows[0]); // 게시글 생성 성공 시 JSON 응답과 상태 코드 201 반환
    } else {
      throw new Error('게시글 생성 결과가 없습니다.');
    }
  } catch (error) {
    console.error('Database error:', error);
    return res.status(500).json({ message: '게시글 생성에 실패했습니다.' });
  }
};

// 특정 게시글 가져오기
exports.getCommunityPostById = async (req, res) => {
  const { postId } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT 
        community.posts_id, 
        community.post_title, 
        community.post_content, 
        community.post_created_at, 
        community.post_status, 
        community.visibility,
        community.member_num,
        member.member_nickname,
        member.member_email
      FROM 
        community
      JOIN 
        member ON community.member_num = member.member_num
      WHERE 
        community.posts_id = $1
      AND 
        community.post_deleted_at IS NULL
      `,
      [postId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching community post:', error);
    res.status(500).json({ message: '게시글을 불러오지 못했습니다.' });
  }
};

// 댓글 저장하기
exports.createComment = async (req, res) => {
  const { posts_id, member_num, comment_content } = req.body;

  console.log('Received comment data on server:', {
    posts_id,
    member_num,
    comment_content,
  });

  // 유효성 검증
  if (!posts_id) {
    console.error('Error: posts_id is missing');
    return res.status(400).json({ message: '게시글 ID가 누락되었습니다.' });
  }
  if (!member_num) {
    console.error('Error: member_num is missing');
    return res
      .status(400)
      .json({ message: '작성자 정보(member_num)가 누락되었습니다.' });
  }
  if (!comment_content) {
    console.error('Error: comment_content is missing');
    return res.status(400).json({ message: '댓글 내용을 입력해야 합니다.' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO community_comment (posts_id, member_num, comment_content, comment_created_at, comment_status) VALUES ($1, $2, $3, NOW(), $4) RETURNING *',
      [posts_id, member_num, comment_content, 'active']
    );

    if (result.rows.length > 0) {
      console.log('Comment created successfully:', result.rows[0]);
      return res.status(201).json(result.rows[0]); // 댓글 생성 성공 시 JSON 응답과 상태 코드 201 반환
    } else {
      throw new Error('댓글 생성 결과가 없습니다.');
    }
  } catch (error) {
    console.error('Database error:', error);
    return res.status(500).json({ message: '댓글 생성에 실패했습니다.' });
  }
};

// 특정 게시글의 댓글 목록 가져오기
exports.getCommentsByPostId = async (req, res) => {
  const { postId } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT 
        community_comment.comment_id, 
        community_comment.posts_id, 
        community_comment.comment_content, 
        community_comment.comment_created_at, 
        community_comment.comment_status,
        member.member_nickname,
        member.member_email
      FROM 
        community_comment
      JOIN 
        member ON community_comment.member_num = member.member_num
      WHERE 
        community_comment.posts_id = $1 
        AND community_comment.comment_deleted_at IS NULL
      ORDER BY 
        community_comment.comment_created_at ASC
      `,
      [postId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: '댓글이 없습니다.' });
    }

    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ message: '댓글을 불러오지 못했습니다.' });
  }
};