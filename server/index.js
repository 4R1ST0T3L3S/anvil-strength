import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3').verbose();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const SECRET_KEY = 'anvil-strength-secret-key'; // En producción usar variables de entorno

// Middleware
app.use(cors());
app.use(express.json());

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Token no proporcionado' });

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user;
    next();
  });
};

// Database Setup
const dbPath = path.resolve(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    createTables();
  }
});

function createTables() {
  // Users Table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      nickname TEXT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      age INTEGER,
      weight REAL,
      height REAL,
      squat_pr REAL,
      bench_pr REAL,
      deadlift_pr REAL,
      bio TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Error creating users table', err.message);
    else console.log('Users table ready.');
  });

  // Posts Table
  db.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `, (err) => {
    if (err) console.error('Error creating posts table', err.message);
    else console.log('Posts table ready.');
  });

  // Comments Table
  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      user_id INTEGER,
      post_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (post_id) REFERENCES posts (id)
    )
  `, (err) => {
    if (err) console.error('Error creating comments table', err.message);
    else console.log('Comments table ready.');
  });
}

// Routes

// Register
app.post('/api/register', async (req, res) => {
  const { name, nickname, email, password, age, weight, height, squat_pr, bench_pr, deadlift_pr, bio } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const sql = `INSERT INTO users (name, nickname, email, password, age, weight, height, squat_pr, bench_pr, deadlift_pr, bio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [name, nickname, email, hashedPassword, age, weight, height, squat_pr, bench_pr, deadlift_pr, bio], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'El email ya está registrado' });
        }
        return res.status(500).json({ error: err.message });
      }
      
      const user = { id: this.lastID, name, nickname, email, age, weight, height, squat_pr, bench_pr, deadlift_pr, bio };
      const token = jwt.sign({ id: this.lastID, email }, SECRET_KEY, { expiresIn: '24h' });
      res.status(201).json({ 
        message: 'Usuario registrado exitosamente',
        token,
        user
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }

  const sql = `SELECT * FROM users WHERE email = ?`;
  db.get(sql, [email], async (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Credenciales inválidas' });

    const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, { expiresIn: '24h' });
    
    // Don't send the password back
    const { password: _, ...userWithoutPassword } = user;
    
    res.json({
      message: 'Login exitoso',
      token,
      user: userWithoutPassword
    });
  });
});

// User Profile (Protected)
app.get('/api/profile', authenticateToken, (req, res) => {
  const sql = `SELECT id, name, nickname, email, age, weight, height, squat_pr, bench_pr, deadlift_pr, bio, created_at FROM users WHERE id = ?`;
  db.get(sql, [req.user.id], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user);
  });
});

app.put('/api/profile', authenticateToken, (req, res) => {
  const { name, nickname, age, weight, height, squat_pr, bench_pr, deadlift_pr, bio } = req.body;
  
  const sql = `
    UPDATE users 
    SET name = ?, nickname = ?, age = ?, weight = ?, height = ?, squat_pr = ?, bench_pr = ?, deadlift_pr = ?, bio = ?
    WHERE id = ?
  `;
  
  db.run(sql, [name, nickname, age, weight, height, squat_pr, bench_pr, deadlift_pr, bio, req.user.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Perfil actualizado correctamente' });
  });
});

// Posts Routes

// Get all posts with user info
app.get('/api/posts', (req, res) => {
  const sql = `
    SELECT posts.*, users.name as author 
    FROM posts 
    JOIN users ON posts.user_id = users.id 
    ORDER BY posts.created_at DESC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Create post (Protected)
app.post('/api/posts', authenticateToken, (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Título y contenido requeridos' });

  const sql = `INSERT INTO posts (title, content, user_id) VALUES (?, ?, ?)`;
  db.run(sql, [title, content, req.user.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, title, content, user_id: req.user.id });
  });
});

// Comments Routes

// Get comments for a post
app.get('/api/posts/:postId/comments', (req, res) => {
  const sql = `
    SELECT comments.*, users.name as author 
    FROM comments 
    JOIN users ON comments.user_id = users.id 
    WHERE post_id = ? 
    ORDER BY comments.created_at ASC
  `;
  db.all(sql, [req.params.postId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Create comment (Protected)
app.post('/api/posts/:postId/comments', authenticateToken, (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Contenido requerido' });

  const sql = `INSERT INTO comments (content, user_id, post_id) VALUES (?, ?, ?)`;
  db.run(sql, [content, req.user.id, req.params.postId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, content, user_id: req.user.id, post_id: req.params.postId });
  });
});

// Delete comment (Protected - only author can delete)
app.delete('/api/comments/:id', authenticateToken, (req, res) => {
  const sql = `DELETE FROM comments WHERE id = ? AND user_id = ?`;
  db.run(sql, [req.params.id, req.user.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(403).json({ error: 'No autorizado o comentario no encontrado' });
    res.json({ message: 'Comentario eliminado' });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
