-- Query: Top authors by total views
SELECT
  u.name AS author,
  u.role,
  COUNT(p.id) AS post_count,
  SUM(p.views) AS total_views,
  ROUND(AVG(p.views), 0) AS avg_views
FROM users u
LEFT JOIN posts p ON u.id = p.user_id
GROUP BY u.id
ORDER BY total_views DESC;
