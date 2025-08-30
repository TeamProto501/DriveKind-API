require('dotenv').config();

const express = require('express');
const cors = require('cors');
const db = require('./database');
const { createServerClient } = require('@supabase/ssr');
const app = express();

const PORT = process.env.PORT || 3000;

// Initialize single Supabase client instance
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createServerClient(supabaseUrl, supabaseKey, {
  cookies: {
    get: () => null,
    set: () => {},
    remove: () => {}
  }
});

app.use(cors());
app.use(express.json());

// JWT Validation Middleware - validates JWT and extracts user token
const validateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = user;
    req.userToken = token; // Store token for passing to database functions
    next();
  } catch (error) {
    console.error('JWT validation error:', error);
    res.status(401).json({ error: 'Token validation failed' });
  }
};

// Organization Access Middleware - gets org_id for user operations
const validateOrgAccess = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get user's organization from profiles table
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('auth_user_id', req.user.id)
      .single();

    if (error || !profile) {
      console.error('Profile lookup error:', error);
      return res.status(403).json({ error: 'User profile not found' });
    }

    if (!profile.org_id) {
      return res.status(403).json({ error: 'User not assigned to an organization' });
    }

    // Attach org_id to request for use in operations
    req.user.org_id = profile.org_id;
    next();
  } catch (error) {
    console.error('Organization validation error:', error);
    res.status(500).json({ error: 'Organization validation failed' });
  }
};

// Combined middleware for JWT + Org validation
const validateJWTWithOrg = [validateJWT, validateOrgAccess];

app.get('/', (req, res) => {
  res.json({
    message: 'DriveKind API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/users', validateJWTWithOrg, async (req, res) => {
  try {
    const users = await db.getAllUsers(req.userToken);
    res.status(200).json({
      message: 'Get all users',
      data: users,
      count: users.length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error retrieving users' });
  }
});

app.listen(PORT, () => {
  console.log(`DriveKind API server running on port ${PORT}`);
});

module.exports = app;