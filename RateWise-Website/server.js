const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'change-this-secret-before-deployment';
const db = new Database(process.env.DB_PATH || 'ratewise.db');
db.pragma('journal_mode = WAL');
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
 password TEXT NOT NULL, is_admin INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL,
 description TEXT NOT NULL, price REAL NOT NULL, image TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
 id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
 rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), body TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'approved', created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(product_id,user_id),
 FOREIGN KEY(product_id) REFERENCES products(id), FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

const count = db.prepare('SELECT COUNT(*) n FROM products').get().n;
if (!count) {
 const seed = [
 ['Aurora Wireless Headphones','Electronics','Comfortable over-ear headphones with active noise cancellation and 30-hour battery life.',3499,'https://images.unsplash.com/photo-1505740420928-5e560c06d30e'],
 ['Pulse Smart Watch','Electronics','Track workouts, sleep and daily activity with a bright display and week-long battery.',4299,'https://images.unsplash.com/photo-1523275335684-37898b6baf30'],
 ['Everyday Backpack','Fashion','A durable, water-resistant backpack with a padded laptop sleeve and clever storage.',1899,'https://images.unsplash.com/photo-1553062407-98eeb64c6a62'],
 ['BrewMate Coffee Maker','Home','A compact coffee maker designed for easy mornings and consistent brewing.',2799,'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085'],
 ['Glow Desk Lamp','Home','An adjustable LED desk lamp with warm and cool light settings.',1299,'https://images.unsplash.com/photo-1507473885765-e6ed057f782c']
 ];
 const ins = db.prepare('INSERT INTO products(name,category,description,price,image) VALUES(?,?,?,?,?)');
 for (const p of seed) ins.run(...p);
}
const adminEmail = (process.env.ADMIN_EMAIL || 'admin@ratewise.local').toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
if (!db.prepare('SELECT id FROM users WHERE email=?').get(adminEmail)) {
 db.prepare('INSERT INTO users(name,email,password,is_admin) VALUES(?,?,?,1)')
   .run('Administrator', adminEmail, bcrypt.hashSync(adminPassword, 10));
}

function auth(req,res,next) {
 const token = (req.headers.authorization || '').replace(/^Bearer /,'');
 try { req.user = jwt.verify(token, SECRET); next(); }
 catch { return res.status(401).json({error:'Please sign in to continue.'}); }
}
function admin(req,res,next) {
 if (!req.user || !req.user.is_admin) return res.status(403).json({error:'Administrator access required.'});
 next();
}
const productQuery = `
SELECT p.*, COALESCE(ROUND(AVG(CASE WHEN r.status='approved' THEN r.rating END),1),0) average_rating,
COUNT(CASE WHEN r.status='approved' THEN 1 END) review_count
FROM products p LEFT JOIN reviews r ON r.product_id=p.id GROUP BY p.id`;
app.get('/api/products',(req,res)=>{
 const rows = db.prepare(productQuery + ' ORDER BY p.id DESC').all();
 res.json(rows);
});
app.get('/api/products/:id',(req,res)=>{
 const p = db.prepare(productQuery + ' HAVING p.id=?').get(Number(req.params.id));
 if(!p) return res.status(404).json({error:'Product not found.'});
 const sort = req.query.sort || 'newest';
 const order = sort==='highest' ? 'rating DESC, created_at DESC' : sort==='oldest' ? 'created_at ASC' : sort==='lowest' ? 'rating ASC, created_at DESC' : 'created_at DESC';
 const reviews = db.prepare(`SELECT r.id,r.rating,r.body,r.created_at,r.updated_at,u.name,u.id user_id
 FROM reviews r JOIN users u ON u.id=r.user_id
 WHERE r.product_id=? AND r.status='approved' ORDER BY ${order}`).all(p.id);
 res.json({...p,reviews});
});
app.post('/api/register', async (req,res)=>{
 const {name,email,password}=req.body||{};
 if(typeof name!=='string'||name.trim().length<2||name.trim().length>50) return res.status(400).json({error:'Name must be 2–50 characters.'});
 if(typeof email!=='string'||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:'Enter a valid email address.'});
 if(typeof password!=='string'||password.length<8) return res.status(400).json({error:'Password must be at least 8 characters.'});
 try {
  const result=db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(name.trim(),email.toLowerCase(),bcrypt.hashSync(password,10));
  const user={id:Number(result.lastInsertRowid),name:name.trim(),email:email.toLowerCase(),is_admin:0};
  res.json({token:jwt.sign(user,SECRET,{expiresIn:'7d'}),user});
 } catch {res.status(409).json({error:'An account with that email already exists.'});}
});
app.post('/api/login',(req,res)=>{
 const {email,password}=req.body||{};
 const user=db.prepare('SELECT * FROM users WHERE email=?').get(String(email||'').toLowerCase());
 if(!user||!bcrypt.compareSync(String(password||''),user.password)) return res.status(401).json({error:'Incorrect email or password.'});
 const safe={id:user.id,name:user.name,email:user.email,is_admin:user.is_admin};
 res.json({token:jwt.sign(safe,SECRET,{expiresIn:'7d'}),user:safe});
});
app.post('/api/reviews',auth,(req,res)=>{
 const {product_id,rating,body}=req.body||{};
 if(!Number.isInteger(Number(rating))||Number(rating)<1||Number(rating)>5) return res.status(400).json({error:'Choose a rating from 1 to 5 stars.'});
 if(typeof body!=='string'||body.trim().length<10||body.trim().length>1000) return res.status(400).json({error:'Review must be 10–1,000 characters.'});
 if(!db.prepare('SELECT id FROM products WHERE id=?').get(Number(product_id))) return res.status(404).json({error:'Product not found.'});
 try {
  const result=db.prepare('INSERT INTO reviews(product_id,user_id,rating,body) VALUES(?,?,?,?)').run(Number(product_id),req.user.id,Number(rating),body.trim());
  res.status(201).json({id:Number(result.lastInsertRowid),message:'Review submitted.'});
 } catch {res.status(409).json({error:'You have already reviewed this product. Edit your existing review instead.'});}
});
app.put('/api/reviews/:id',auth,(req,res)=>{
 const r=db.prepare('SELECT * FROM reviews WHERE id=?').get(Number(req.params.id));
 if(!r) return res.status(404).json({error:'Review not found.'});
 if(r.user_id!==req.user.id&&!req.user.is_admin) return res.status(403).json({error:'You can only edit your own review.'});
 const {rating,body}=req.body||{};
 if(!Number.isInteger(Number(rating))||Number(rating)<1||Number(rating)>5||typeof body!=='string'||body.trim().length<10||body.trim().length>1000)
  return res.status(400).json({error:'Use 1–5 stars and a review of 10–1,000 characters.'});
 db.prepare("UPDATE reviews SET rating=?,body=?,status=CASE WHEN ?=1 THEN status ELSE 'pending' END,updated_at=CURRENT_TIMESTAMP WHERE id=?")
 .run(Number(rating),body.trim(),req.user.is_admin?1:0,r.id);
 res.json({message:'Review updated.'});
});
app.delete('/api/reviews/:id',auth,(req,res)=>{
 const r=db.prepare('SELECT * FROM reviews WHERE id=?').get(Number(req.params.id));
 if(!r) return res.status(404).json({error:'Review not found.'});
 if(r.user_id!==req.user.id&&!req.user.is_admin) return res.status(403).json({error:'You can only delete your own review.'});
 db.prepare('DELETE FROM reviews WHERE id=?').run(r.id); res.json({message:'Review deleted.'});
});
app.get('/api/my-reviews',auth,(req,res)=>{
 res.json(db.prepare(`SELECT r.*,p.name product_name FROM reviews r JOIN products p ON p.id=r.product_id WHERE r.user_id=? ORDER BY r.created_at DESC`).all(req.user.id));
});
app.get('/api/admin/reviews',auth,admin,(req,res)=>{
 res.json(db.prepare(`SELECT r.*,p.name product_name,u.name user_name,u.email FROM reviews r JOIN products p ON p.id=r.product_id JOIN users u ON u.id=r.user_id ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,r.created_at DESC`).all());
});
app.patch('/api/admin/reviews/:id',auth,admin,(req,res)=>{
 const {status}=req.body||{};
 if(!['approved','pending','hidden'].includes(status)) return res.status(400).json({error:'Invalid moderation status.'});
 const result=db.prepare('UPDATE reviews SET status=? WHERE id=?').run(status,Number(req.params.id));
 if(!result.changes) return res.status(404).json({error:'Review not found.'});
 res.json({message:'Review status updated.'});
});
app.delete('/api/admin/reviews/:id',auth,admin,(req,res)=>{
 const result=db.prepare('DELETE FROM reviews WHERE id=?').run(Number(req.params.id));
 if(!result.changes) return res.status(404).json({error:'Review not found.'});
 res.json({message:'Review deleted.'});
});
app.get('/api/health',(req,res)=>res.json({status:'ok'}));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`RateWise running on port ${PORT}`));
