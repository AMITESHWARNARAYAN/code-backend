const express = require('express');
const router = express.Router();
const User = require('../models/User');
const AllottedQuestion = require('../models/AllottedQuestion');
const { adminAuth } = require('../middleware/auth');

// Get all registered users
router.get('/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find({ role: 'user' })
      .select('-password')
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user count
router.get('/users/count', adminAuth, async (req, res) => {
  try {
    const count = await User.countDocuments({ role: 'user' });
    res.json({ count });
  } catch (error) {
    console.error('Get user count error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user info
router.get('/users/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Get user's allotted questions
    const allottedQuestions = await AllottedQuestion.find({ user: req.params.id })
      .populate('question', 'title difficulty')
      .sort({ allottedAt: -1 });
    
    res.json({ user, allottedQuestions });
  } catch (error) {
    console.error('Get user info error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Deactivate user (soft delete)
router.put('/users/:id/deactivate', adminAuth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User deactivated successfully', user });
  } catch (error) {
    console.error('Deactivate user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete user permanently
router.delete('/users/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Delete all related data
    await AllottedQuestion.deleteMany({ user: req.params.id });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get top performers
router.get('/leaderboard', adminAuth, async (req, res) => {
  try {
    const topPerformers = await AllottedQuestion.aggregate([
      { $match: { status: 'evaluated' } },
      {
        $group: {
          _id: '$user',
          username: { $first: '$username' },
          teamName: { $first: '$teamName' },
          totalScore: { $sum: '$score' },
          totalTestCasesPassed: { $sum: '$testCasesPassed' },
          questionsAttempted: { $sum: 1 }
        }
      },
      { $sort: { totalScore: -1 } },
      { $limit: 10 }
    ]);

    res.json(topPerformers);
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

