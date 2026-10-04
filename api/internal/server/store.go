package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/url"
	"strings"

	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
}

func sqliteDSN(dbPath string) string {
	path := dbPath
	if path == "" {
		path = "nova.db"
	}
	if strings.ContainsAny(path, " ?#") {
		path = url.PathEscape(path)
	}
	return "file:" + path + "?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)"
}

func openStore(dbPath string) (*Store, error) {
	db, err := sql.Open("sqlite", sqliteDSN(dbPath))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(16)
	if err := migrate(db); err != nil {
		_ = db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *Store) DB() *sql.DB {
	return s.db
}

func migrate(db *sql.DB) error {
	_, err := db.Exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('worker', 'poster', 'admin')),
  display_name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  skills_json TEXT NOT NULL,
  city TEXT NOT NULL,
  availability TEXT NOT NULL,
  bio TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  poster_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  city TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  amount_bani INTEGER NOT NULL,
  description TEXT NOT NULL,
  safety_note TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'assigned', 'completed', 'hidden')),
  assignee_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  worker_id TEXT NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TEXT NOT NULL,
  UNIQUE (task_id, worker_id)
);
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  subject_id TEXT NOT NULL REFERENCES users(id),
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (task_id, author_id)
);
`)
	return err
}

type seedTask struct {
	id, title, category, city, starts, ends, description, safety, created string
	amount                                                                int64
}

func seedTasks() []seedTask {
	return []seedTask{
		{
			id:          "task_seed_event_setup",
			title:       "Ajutor la amenajarea evenimentului",
			category:    "event_setup",
			city:        "București",
			starts:      "2026-10-05T14:00:00+03:00",
			ends:        "2026-10-05T16:00:00+03:00",
			amount:      10000,
			description: "Ajută la așezarea scaunelor și a unei mese ușoare, timp de două ore, într-un spațiu public.",
			safety:      "Spațiu public. Fără acces la domiciliu și fără bani cash.",
			created:     "2026-10-04T12:05:00+03:00",
		},
		{
			id:          "task_seed_shop_cover",
			title:       "Acoperire scurtă la stand",
			category:    "shop_cover",
			city:        "București",
			starts:      "2026-10-06T10:00:00+03:00",
			ends:        "2026-10-06T14:00:00+03:00",
			amount:      15000,
			description: "Ajutor la un stand de cartier timp de patru ore. Fără casă și fără bani cash.",
			safety:      "Spațiu public. Fără date personale.",
			created:     "2026-10-04T12:06:00+03:00",
		},
	}
}

type execer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func insertSeed(ctx context.Context, ex execer) error {
	users := []struct{ id, role, name string }{
		{"worker-1", "worker", "Maria Ionescu"},
		{"poster-1", "poster", "Andrei Popescu"},
		{"admin-1", "admin", "Moderator Nova"},
	}
	for _, u := range users {
		if _, err := ex.ExecContext(ctx, `INSERT INTO users (id, role, display_name) VALUES (?, ?, ?)`, u.id, u.role, u.name); err != nil {
			return err
		}
	}
	skills, err := json.Marshal([]string{"amenajare eveniment", "cărat obiecte ușoare"})
	if err != nil {
		return err
	}
	if _, err := ex.ExecContext(ctx, `INSERT INTO profiles (user_id, skills_json, city, availability, bio) VALUES (?, ?, ?, ?, ?)`,
		"worker-1", string(skills), "București", "După-amieze în timpul săptămânii", "Disponibilă pentru sarcini locale scurte. Profil demo pentru adult."); err != nil {
		return err
	}
	for _, t := range seedTasks() {
		if _, err := ex.ExecContext(ctx, `INSERT INTO tasks (
			id, poster_id, title, category, city, starts_at, ends_at, amount_bani, description, safety_note, status, assignee_id, created_at
		) VALUES (?, 'poster-1', ?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, ?)`,
			t.id, t.title, t.category, t.city, t.starts, t.ends, t.amount, t.description, t.safety, t.created); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) withImmediate(fn func(context.Context, *sql.Conn) error) error {
	ctx := context.Background()
	conn, err := s.db.Conn(ctx)
	if err != nil {
		return errInternal
	}
	defer conn.Close()
	if _, err := conn.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return errInternal
	}
	if err := fn(ctx, conn); err != nil {
		_, _ = conn.ExecContext(ctx, "ROLLBACK")
		if _, ok := asAppError(err); ok {
			return err
		}
		return errInternal
	}
	if _, err := conn.ExecContext(ctx, "COMMIT"); err != nil {
		_, _ = conn.ExecContext(ctx, "ROLLBACK")
		return errInternal
	}
	return nil
}

func (s *Store) SeedIfEmpty() error {
	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n); err != nil {
		return errInternal
	}
	if n > 0 {
		return nil
	}
	return s.withImmediate(func(ctx context.Context, conn *sql.Conn) error {
		var n int
		if err := conn.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&n); err != nil {
			return errInternal
		}
		if n > 0 {
			return nil
		}
		if err := insertSeed(ctx, conn); err != nil {
			return errInternal
		}
		return nil
	})
}

func (s *Store) Reset() error {
	return s.withImmediate(func(ctx context.Context, conn *sql.Conn) error {
		for _, q := range []string{
			`DELETE FROM reviews`,
			`DELETE FROM applications`,
			`DELETE FROM tasks`,
			`DELETE FROM profiles`,
			`DELETE FROM users`,
		} {
			if _, err := conn.ExecContext(ctx, q); err != nil {
				return errInternal
			}
		}
		if err := insertSeed(ctx, conn); err != nil {
			return errInternal
		}
		return nil
	})
}

func (s *Store) FindUser(id string) (*User, error) {
	var u User
	err := s.db.QueryRow(`SELECT id, role, display_name FROM users WHERE id = ?`, id).Scan(&u.ID, &u.Role, &u.DisplayName)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, errInternal
	}
	return &u, nil
}

const taskSelect = `
SELECT t.id, t.poster_id, pu.display_name, t.title, t.category, t.city,
       t.starts_at, t.ends_at, t.amount_bani, t.description, t.safety_note,
       t.status, t.assignee_id, au.display_name, t.created_at
FROM tasks t
JOIN users pu ON pu.id = t.poster_id
LEFT JOIN users au ON au.id = t.assignee_id
`

func scanTask(sc interface{ Scan(...any) error }) (TaskPublic, error) {
	var t TaskPublic
	var assigneeID, assigneeName sql.NullString
	err := sc.Scan(
		&t.ID, &t.PosterID, &t.PosterName, &t.Title, &t.Category, &t.City,
		&t.StartsAt, &t.EndsAt, &t.AmountBani, &t.Description, &t.SafetyNote,
		&t.Status, &assigneeID, &assigneeName, &t.CreatedAt,
	)
	if err != nil {
		return TaskPublic{}, err
	}
	if assigneeID.Valid {
		id := assigneeID.String
		t.AssigneeID = &id
	}
	if assigneeName.Valid {
		name := assigneeName.String
		t.AssigneeName = &name
	}
	return t, nil
}

func (s *Store) queryTasks(query string, args ...any) ([]TaskPublic, error) {
	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, errInternal
	}
	defer rows.Close()
	out := []TaskPublic{}
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return nil, errInternal
		}
		out = append(out, t)
	}
	if err := rows.Err(); err != nil {
		return nil, errInternal
	}
	return out, nil
}

func (s *Store) taskByID(id string) (TaskPublic, error) {
	row := s.db.QueryRow(taskSelect+` WHERE t.id = ?`, id)
	t, err := scanTask(row)
	if err == sql.ErrNoRows {
		return TaskPublic{}, errNotFound
	}
	if err != nil {
		return TaskPublic{}, errInternal
	}
	return t, nil
}

func (s *Store) ListOpen(category, city string) ([]TaskPublic, error) {
	q := taskSelect + ` WHERE t.status = 'open'`
	var args []any
	if c := strings.TrimSpace(category); c != "" {
		q += ` AND t.category = ?`
		args = append(args, c)
	}
	q += ` ORDER BY t.starts_at ASC, t.id ASC`
	tasks, err := s.queryTasks(q, args...)
	if err != nil {
		return nil, err
	}
	want := strings.TrimSpace(city)
	if want == "" {
		return tasks, nil
	}
	out := []TaskPublic{}
	for _, t := range tasks {
		if strings.EqualFold(strings.TrimSpace(t.City), want) {
			out = append(out, t)
		}
	}
	return out, nil
}

func (s *Store) PublicTask(id string) (TaskPublic, error) {
	row := s.db.QueryRow(taskSelect+` WHERE t.id = ? AND t.status != 'hidden'`, id)
	t, err := scanTask(row)
	if err == sql.ErrNoRows {
		return TaskPublic{}, errNotFound
	}
	if err != nil {
		return TaskPublic{}, errInternal
	}
	return t, nil
}

func (s *Store) CreateTask(poster User, req CreateTaskRequest) (TaskPublic, error) {
	id, err := NewID("task_")
	if err != nil {
		return TaskPublic{}, errInternal
	}
	created := NowRFC3339()
	title := strings.TrimSpace(req.Title)
	city := strings.TrimSpace(req.City)
	starts := strings.TrimSpace(req.StartsAt)
	ends := strings.TrimSpace(req.EndsAt)
	description := strings.TrimSpace(req.Description)
	safety := strings.TrimSpace(req.SafetyNote)
	category := strings.TrimSpace(req.Category)
	_, err = s.db.Exec(`INSERT INTO tasks (
		id, poster_id, title, category, city, starts_at, ends_at, amount_bani, description, safety_note, status, assignee_id, created_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, ?)`,
		id, poster.ID, title, category, city, starts, ends, req.AmountBani, description, safety, created)
	if err != nil {
		return TaskPublic{}, errInternal
	}
	return s.taskByID(id)
}

func (s *Store) MyTasks(posterID string) ([]TaskPublic, error) {
	return s.queryTasks(taskSelect+` WHERE t.poster_id = ? AND t.status != 'hidden' ORDER BY t.created_at DESC, t.id DESC`, posterID)
}

func (s *Store) AdminTasks() ([]TaskPublic, error) {
	return s.queryTasks(taskSelect + ` ORDER BY t.created_at DESC, t.id DESC`)
}

func (s *Store) Hide(id string) (TaskPublic, error) {
	current, err := s.taskByID(id)
	if err != nil {
		return TaskPublic{}, err
	}
	if current.Status == "hidden" {
		return current, nil
	}
	if _, err := s.db.Exec(`UPDATE tasks SET status = 'hidden' WHERE id = ?`, id); err != nil {
		return TaskPublic{}, errInternal
	}
	return s.taskByID(id)
}

func decodeSkills(raw string) []string {
	skills := []string{}
	if raw == "" {
		return skills
	}
	if err := json.Unmarshal([]byte(raw), &skills); err != nil || skills == nil {
		return []string{}
	}
	return skills
}

func (s *Store) Profile(userID string) (Profile, error) {
	var p Profile
	var skillsJSON string
	err := s.db.QueryRow(`
		SELECT u.id, u.display_name, p.skills_json, p.city, p.availability, p.bio
		FROM profiles p
		JOIN users u ON u.id = p.user_id
		WHERE p.user_id = ?`, userID).Scan(&p.UserID, &p.DisplayName, &skillsJSON, &p.City, &p.Availability, &p.Bio)
	if err == sql.ErrNoRows {
		return Profile{}, errNotFound
	}
	if err != nil {
		return Profile{}, errInternal
	}
	p.Skills = decodeSkills(skillsJSON)
	return p, nil
}

func (s *Store) SaveProfile(user User, in ProfileWrite) (Profile, error) {
	skills := make([]string, 0, len(in.Skills))
	for _, sk := range in.Skills {
		skills = append(skills, strings.TrimSpace(sk))
	}
	if skills == nil {
		skills = []string{}
	}
	raw, err := json.Marshal(skills)
	if err != nil {
		return Profile{}, errInternal
	}
	city := strings.TrimSpace(in.City)
	availability := strings.TrimSpace(in.Availability)
	bio := strings.TrimSpace(in.Bio)
	_, err = s.db.Exec(`
		INSERT INTO profiles (user_id, skills_json, city, availability, bio) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(user_id) DO UPDATE SET
			skills_json = excluded.skills_json,
			city = excluded.city,
			availability = excluded.availability,
			bio = excluded.bio`,
		user.ID, string(raw), city, availability, bio)
	if err != nil {
		return Profile{}, errInternal
	}
	return s.Profile(user.ID)
}

const appSelect = `
SELECT a.id, a.task_id, a.worker_id, u.display_name,
       COALESCE(p.skills_json, '[]'), COALESCE(p.city, ''), COALESCE(p.bio, ''),
       a.message, a.status, a.created_at
FROM applications a
JOIN users u ON u.id = a.worker_id
LEFT JOIN profiles p ON p.user_id = a.worker_id
`

func scanApp(sc interface{ Scan(...any) error }) (ApplicationView, error) {
	var a ApplicationView
	var skillsJSON string
	err := sc.Scan(&a.ID, &a.TaskID, &a.WorkerID, &a.WorkerName, &skillsJSON, &a.City, &a.Bio, &a.Message, &a.Status, &a.CreatedAt)
	if err != nil {
		return ApplicationView{}, err
	}
	a.Skills = decodeSkills(skillsJSON)
	return a, nil
}

func (s *Store) applicationByID(id string) (ApplicationView, error) {
	a, err := scanApp(s.db.QueryRow(appSelect+` WHERE a.id = ?`, id))
	if err == sql.ErrNoRows {
		return ApplicationView{}, errNotFound
	}
	if err != nil {
		return ApplicationView{}, errInternal
	}
	return a, nil
}

func (s *Store) Apply(worker User, taskID, message string) (ApplicationView, error) {
	var appID string
	err := s.withImmediate(func(ctx context.Context, conn *sql.Conn) error {
		var posterID, status string
		err := conn.QueryRowContext(ctx, `SELECT poster_id, status FROM tasks WHERE id = ?`, taskID).Scan(&posterID, &status)
		if err == sql.ErrNoRows || (err == nil && status == "hidden") {
			return errNotFound
		}
		if err != nil {
			return errInternal
		}
		if worker.Role != "worker" {
			return errForbidden
		}
		if worker.ID == posterID {
			return errCannotApplyOwnTask
		}
		var profileCount int
		if err := conn.QueryRowContext(ctx, `SELECT COUNT(*) FROM profiles WHERE user_id = ?`, worker.ID).Scan(&profileCount); err != nil {
			return errInternal
		}
		if profileCount == 0 {
			return errProfileRequired
		}
		if status != "open" {
			return errTaskNotOpen
		}
		var existing int
		if err := conn.QueryRowContext(ctx, `SELECT COUNT(*) FROM applications WHERE task_id = ? AND worker_id = ?`, taskID, worker.ID).Scan(&existing); err != nil {
			return errInternal
		}
		if existing > 0 {
			return errDuplicateApplication
		}
		id, err := NewID("app_")
		if err != nil {
			return errInternal
		}
		appID = id
		_, err = conn.ExecContext(ctx, `INSERT INTO applications (id, task_id, worker_id, message, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)`,
			id, taskID, worker.ID, strings.TrimSpace(message), NowRFC3339())
		if err != nil {
			return errInternal
		}
		return nil
	})
	if err != nil {
		return ApplicationView{}, err
	}
	return s.applicationByID(appID)
}

func (s *Store) Applications(taskID, posterID string) ([]ApplicationView, error) {
	var owner string
	err := s.db.QueryRow(`SELECT poster_id FROM tasks WHERE id = ?`, taskID).Scan(&owner)
	if err == sql.ErrNoRows {
		return nil, errNotFound
	}
	if err != nil {
		return nil, errInternal
	}
	if owner != posterID {
		return nil, errForbidden
	}
	rows, err := s.db.Query(appSelect+` WHERE a.task_id = ? ORDER BY a.created_at ASC, a.id ASC`, taskID)
	if err != nil {
		return nil, errInternal
	}
	defer rows.Close()
	out := []ApplicationView{}
	for rows.Next() {
		a, err := scanApp(rows)
		if err != nil {
			return nil, errInternal
		}
		out = append(out, a)
	}
	if err := rows.Err(); err != nil {
		return nil, errInternal
	}
	return out, nil
}

func (s *Store) MyApplications(workerID string) ([]ApplicationWithTask, error) {
	rows, err := s.db.Query(`
		SELECT a.id
		FROM applications a
		JOIN tasks t ON t.id = a.task_id
		WHERE a.worker_id = ? AND t.status != 'hidden'
		ORDER BY a.created_at DESC, a.id DESC`, workerID)
	if err != nil {
		return nil, errInternal
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, errInternal
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, errInternal
	}
	out := []ApplicationWithTask{}
	for _, id := range ids {
		app, err := s.applicationByID(id)
		if err != nil {
			return nil, err
		}
		task, err := s.taskByID(app.TaskID)
		if err != nil {
			return nil, err
		}
		out = append(out, ApplicationWithTask{ApplicationView: app, Task: task})
	}
	return out, nil
}

func (s *Store) Accept(applicationID, posterID string) (TaskPublic, error) {
	var taskID string
	err := s.withImmediate(func(ctx context.Context, conn *sql.Conn) error {
		var workerID, appStatus string
		err := conn.QueryRowContext(ctx, `SELECT task_id, worker_id, status FROM applications WHERE id = ?`, applicationID).Scan(&taskID, &workerID, &appStatus)
		if err == sql.ErrNoRows {
			return errNotFound
		}
		if err != nil {
			return errInternal
		}
		var owner, taskStatus string
		err = conn.QueryRowContext(ctx, `SELECT poster_id, status FROM tasks WHERE id = ?`, taskID).Scan(&owner, &taskStatus)
		if err == sql.ErrNoRows {
			return errNotFound
		}
		if err != nil {
			return errInternal
		}
		if owner != posterID {
			return errForbidden
		}
		if taskStatus != "open" || appStatus != "pending" {
			return errTaskAlreadyAssigned
		}
		if _, err := conn.ExecContext(ctx, `UPDATE applications SET status = 'accepted' WHERE id = ?`, applicationID); err != nil {
			return errInternal
		}
		if _, err := conn.ExecContext(ctx, `UPDATE applications SET status = 'rejected' WHERE task_id = ? AND status = 'pending' AND id != ?`, taskID, applicationID); err != nil {
			return errInternal
		}
		if _, err := conn.ExecContext(ctx, `UPDATE tasks SET status = 'assigned', assignee_id = ? WHERE id = ?`, workerID, taskID); err != nil {
			return errInternal
		}
		return nil
	})
	if err != nil {
		return TaskPublic{}, err
	}
	return s.taskByID(taskID)
}

func (s *Store) Complete(taskID, posterID string) (TaskPublic, error) {
	var owner, status string
	err := s.db.QueryRow(`SELECT poster_id, status FROM tasks WHERE id = ?`, taskID).Scan(&owner, &status)
	if err == sql.ErrNoRows {
		return TaskPublic{}, errNotFound
	}
	if err != nil {
		return TaskPublic{}, errInternal
	}
	if owner != posterID {
		return TaskPublic{}, errForbidden
	}
	if status != "assigned" {
		return TaskPublic{}, errTaskNotAssigned
	}
	if _, err := s.db.Exec(`UPDATE tasks SET status = 'completed' WHERE id = ? AND status = 'assigned'`, taskID); err != nil {
		return TaskPublic{}, errInternal
	}
	return s.taskByID(taskID)
}

func (s *Store) AddReview(actor User, taskID string, stars int, text string) (Review, error) {
	var reviewID string
	err := s.withImmediate(func(ctx context.Context, conn *sql.Conn) error {
		var posterID, status string
		var assignee sql.NullString
		err := conn.QueryRowContext(ctx, `SELECT poster_id, status, assignee_id FROM tasks WHERE id = ?`, taskID).Scan(&posterID, &status, &assignee)
		if err == sql.ErrNoRows || (err == nil && status == "hidden") {
			return errNotFound
		}
		if err != nil {
			return errInternal
		}
		isPoster := actor.ID == posterID
		isAssignee := assignee.Valid && actor.ID == assignee.String
		if !isPoster && !isAssignee {
			return errForbidden
		}
		if status != "completed" {
			return errTaskNotCompleted
		}
		var n int
		if err := conn.QueryRowContext(ctx, `SELECT COUNT(*) FROM reviews WHERE task_id = ? AND author_id = ?`, taskID, actor.ID).Scan(&n); err != nil {
			return errInternal
		}
		if n > 0 {
			return errDuplicateReview
		}
		subjectID := posterID
		if isPoster {
			if !assignee.Valid {
				return errTaskNotCompleted
			}
			subjectID = assignee.String
		}
		id, err := NewID("rev_")
		if err != nil {
			return errInternal
		}
		reviewID = id
		_, err = conn.ExecContext(ctx, `INSERT INTO reviews (id, task_id, author_id, subject_id, stars, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			id, taskID, actor.ID, subjectID, stars, strings.TrimSpace(text), NowRFC3339())
		if err != nil {
			return errInternal
		}
		return nil
	})
	if err != nil {
		return Review{}, err
	}
	return s.reviewByID(reviewID)
}

func scanReview(sc interface{ Scan(...any) error }) (Review, error) {
	var r Review
	err := sc.Scan(&r.ID, &r.TaskID, &r.AuthorID, &r.AuthorName, &r.SubjectID, &r.SubjectName, &r.Stars, &r.Text, &r.CreatedAt)
	return r, err
}

const reviewSelect = `
SELECT r.id, r.task_id, r.author_id, au.display_name, r.subject_id, su.display_name, r.stars, r.text, r.created_at
FROM reviews r
JOIN users au ON au.id = r.author_id
JOIN users su ON su.id = r.subject_id
`

func (s *Store) reviewByID(id string) (Review, error) {
	r, err := scanReview(s.db.QueryRow(reviewSelect+` WHERE r.id = ?`, id))
	if err == sql.ErrNoRows {
		return Review{}, errNotFound
	}
	if err != nil {
		return Review{}, errInternal
	}
	return r, nil
}

func (s *Store) Reviews(taskID string) ([]Review, error) {
	var status string
	err := s.db.QueryRow(`SELECT status FROM tasks WHERE id = ?`, taskID).Scan(&status)
	if err == sql.ErrNoRows || (err == nil && status == "hidden") {
		return nil, errNotFound
	}
	if err != nil {
		return nil, errInternal
	}
	rows, err := s.db.Query(reviewSelect+` WHERE r.task_id = ? ORDER BY r.created_at ASC, r.id ASC`, taskID)
	if err != nil {
		return nil, errInternal
	}
	defer rows.Close()
	out := []Review{}
	for rows.Next() {
		r, err := scanReview(rows)
		if err != nil {
			return nil, errInternal
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, errInternal
	}
	return out, nil
}
