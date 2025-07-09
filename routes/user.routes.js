const express = require('express');
const router = express.Router();
const User = require('../schemas/user.model');

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, dob } = req.body;
    const user = new User({ name, email, password, dob });
    await user.save();
    res.status(201).json({ message: 'User created', user });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
