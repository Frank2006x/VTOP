const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

// Initialize Express app
const app = express();

// Configuration
const PORT = 3000;
const dataFilePath = path.join(__dirname, "logindetails.json");
const activityFilePath = path.join(__dirname, "logactivity.json");

// Middleware
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// Enhanced CORS configuration
const allowedOrigins = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://localhost:8080"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

// Data Management
let users = {};
let activityLog = [];

const loadData = () => {
  try {
    if (fs.existsSync(dataFilePath)) {
      users = JSON.parse(fs.readFileSync(dataFilePath, "utf8"));
    }
    if (fs.existsSync(activityFilePath)) {
      activityLog = JSON.parse(fs.readFileSync(activityFilePath, "utf8"));
    }
  } catch (error) {
    console.error("Error loading data files:", error);
  }
};

const saveData = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error(`Error saving ${filePath}:`, error);
  }
};

// Helper Functions
const validateEmail = (email, isFaculty) => {
  const domain = isFaculty ? "@vitfaculty.ac.in" : "@vitstudent.ac.in";
  return email.endsWith(domain);
};

const logActivity = (username, action, status, isFaculty = false) => {
  const activity = {
    username,
    action,
    status,
    userType: isFaculty ? "faculty" : "student",
    timestamp: new Date().toISOString(),
  };
  activityLog.push(activity);
  saveData(activityFilePath, activityLog);
};

const getLastLoginByType = (userType) => {
  const logins = activityLog.filter(
    entry => entry.action === "login" &&
            entry.status === "success" &&
            entry.userType === userType
  );
  return logins.length > 0 ? logins[logins.length - 1] : null;
};

// Initialize data
loadData();

// API Endpoints

// Authentication Endpoints
app.post("/signup", (req, res) => {
  try {
    const { username, password, email, isFaculty } = req.body;
    const userIsFaculty = !!isFaculty;

    // Validation
    if (!username || !password || !email) {
      return res.status(400).json({ message: "Username, password, and email are required" });
    }

    if (username.length < 8) {
      return res.status(400).json({ message: "Username must be at least 8 characters long" });
    }

    if (!validateEmail(email, userIsFaculty)) {
      return res.status(400).json({
        message: userIsFaculty
          ? "Only @vitfaculty.ac.in emails are allowed for faculty"
          : "Only @vitstudent.ac.in emails are allowed for students"
      });
    }

    if (users[username]) {
      logActivity(username, "signup", "failed (username exists)", userIsFaculty);
      return res.status(409).json({ message: "Username already exists" });
    }

    // Create user
    users[username] = { password, email, isFaculty: userIsFaculty };
    saveData(dataFilePath, users);
    logActivity(username, "signup", "success", userIsFaculty);
    
    return res.status(201).json({
      message: "Signup successful",
      userType: userIsFaculty ? "faculty" : "student"
    });

  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/login", (req, res) => {
  try {
    const { username, password, isFaculty } = req.body;
    const userIsFaculty = !!isFaculty;

    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    if (!users[username]) {
      logActivity(username, "login", "failed (user not found)", userIsFaculty);
      return res.status(401).json({ message: "Invalid username or password" });
    }

    if (users[username].password === password) {
      if (users[username].isFaculty !== userIsFaculty) {
        logActivity(username, "login", "failed (wrong user type)", userIsFaculty);
        return res.status(401).json({
          message: `Please login as ${users[username].isFaculty ? "faculty" : "student"}`
        });
      }

      logActivity(username, "login", "success", userIsFaculty);
      return res.status(200).json({
        message: "Login successful",
        userType: users[username].isFaculty ? "faculty" : "student"
      });
    } else {
      logActivity(username, "login", "failed", userIsFaculty);
      return res.status(401).json({ message: "Invalid username or password" });
    }
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Password Management
app.post("/change-password", (req, res) => {
  try {
    const { username, oldPassword, newPassword, isFaculty } = req.body;
    const userIsFaculty = !!isFaculty;

    if (!username || !oldPassword || !newPassword) {
      return res.status(400).json({
        message: "Username, old password, and new password are required"
      });
    }

    if (!users[username]) {
      logActivity(username, "change-password", "failed (user not found)", userIsFaculty);
      return res.status(404).json({ message: "User not found" });
    }

    if (users[username].password !== oldPassword) {
      logActivity(username, "change-password", "failed (wrong password)", userIsFaculty);
      return res.status(401).json({ message: "Incorrect old password" });
    }

    users[username].password = newPassword;
    saveData(dataFilePath, users);
    logActivity(username, "change-password", "success", users[username].isFaculty);
    
    return res.status(200).json({
      message: "Password changed successfully",
      userType: users[username].isFaculty ? "faculty" : "student"
    });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/forgot-password", (req, res) => {
  try {
    const { username, email, isFaculty } = req.body;
    const userIsFaculty = !!isFaculty;

    if (!username || !email) {
      return res.status(400).json({ message: "Username and email are required" });
    }

    if (!users[username]) {
      logActivity(username, "forgot-password", "failed (user not found)", userIsFaculty);
      return res.status(404).json({ message: "User not found" });
    }

    if (users[username].email !== email) {
      logActivity(username, "forgot-password", "failed (email mismatch)", userIsFaculty);
      return res.status(401).json({ message: "Email does not match our records" });
    }

    if (users[username].isFaculty !== userIsFaculty) {
      logActivity(username, "forgot-password", "failed (wrong user type)", userIsFaculty);
      return res.status(401).json({
        message: `Please request as ${users[username].isFaculty ? "faculty" : "student"}`
      });
    }

    logActivity(username, "forgot-password", "success", userIsFaculty);
    return res.status(200).json({
      message: "Your password is: " + users[username].password,
      userType: users[username].isFaculty ? "faculty" : "student"
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// User Data Endpoints
app.get("/login-activity", (req, res) => {
  try {
    res.status(200).json(activityLog);
  } catch (error) {
    console.error("Error getting activity log:", error);
    res.status(500).json({ error: "Failed to retrieve activity log" });
  }
});

app.get("/user/:username", (req, res) => {
  try {
    const { username } = req.params;

    if (!users[username]) {
      return res.status(404).json({ message: "User not found" });
    }

    const { password, ...userData } = users[username];
    res.status(200).json(userData);
  } catch (error) {
    console.error("Error getting user data:", error);
    res.status(500).json({ error: "Failed to retrieve user data" });
  }
});

// Last Login Endpoints


// Updated helper function to get last activity by type
const getLastActivityByType = (userType) => {
  const activities = activityLog.filter(
    entry => entry.userType === userType
  );
  
  if (activities.length === 0) return null;
  
  // Sort by timestamp descending and return the most recent
  return activities.sort((a, b) => 
    new Date(b.timestamp) - new Date(a.timestamp)
)[0];
};

// POST endpoint for last student activity
app.post("/api/last-student-activity", (req, res) => {
  try {
    const lastActivity = getLastActivityByType("student");
    
    if (!lastActivity) {
      return res.status(404).json({ 
        success: false,
        message: "No student activities found",
        data: null
      });
    }

    res.status(200).json({
      success: true,
      message: "Last student activity retrieved",
      data: {
        username: lastActivity.username,
        action: lastActivity.action,
        status: lastActivity.status,
        timestamp: lastActivity.timestamp,
        email: users[lastActivity.username]?.email || "N/A"
      }
    });
  } catch (error) {
    console.error("Error getting last student activity:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to get last student activity",
      error: error.message 
    });
  }
});

// POST endpoint for last faculty activity
app.post("/api/last-faculty-activity", (req, res) => {
  try {
    const lastActivity = getLastActivityByType("faculty");
    
    if (!lastActivity) {
      return res.status(404).json({ 
        success: false,
        message: "No faculty activities found",
        data: null
      });
    }

    res.status(200).json({
      success: true,
      message: "Last faculty activity retrieved",
      data: {
        username: lastActivity.username,
        action: lastActivity.action,
        status: lastActivity.status,
        timestamp: lastActivity.timestamp,
        email: users[lastActivity.username]?.email || "N/A"
      }
    });
  } catch (error) {
    console.error("Error getting last faculty activity:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to get last faculty activity",
      error: error.message 
    });
  }
});

// Serve frontend files
app.use(express.static(path.join(__dirname, "../landing_page")));

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`API Documentation:`);
  console.log(`- POST /signup - Register new user`);
  console.log(`- POST /login - Authenticate user`);
  console.log(`- GET /last-student-login - Get last student login`);
  console.log(`- GET /last-faculty-login - Get last faculty login`);
});