const express = require('express');
const router = express.Router();
const Auction = require('../models/Auction');
const AllottedQuestion = require('../models/AllottedQuestion');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

// Get current user's wallet
router.get('/wallet', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('wallet');
    res.json({ wallet: user.wallet });
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all allotted questions for current user
router.get('/my-questions', auth, async (req, res) => {
  try {
    const allottedQuestions = await AllottedQuestion.find({ user: req.userId })
      .populate('question')
      .sort({ allottedAt: -1 });
    res.json(allottedQuestions);
  } catch (error) {
    console.error('Get my questions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all allotted questions (admin)
router.get('/allotted', auth, async (req, res) => {
  try {
    const allottedQuestions = await AllottedQuestion.find()
      .populate('question', 'title difficulty')
      .populate('user', 'username teamName')
      .sort({ allottedAt: -1 });
    res.json(allottedQuestions);
  } catch (error) {
    console.error('Get allotted questions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Submit code for allotted question
router.post('/submit/:allottedQuestionId', auth, async (req, res) => {
  try {
    const { code } = req.body;
    const allottedQuestion = await AllottedQuestion.findOne({
      _id: req.params.allottedQuestionId,
      user: req.userId
    }).populate('question');

    if (!allottedQuestion) {
      return res.status(404).json({ message: 'Question not found or not allotted to you' });
    }

    if (allottedQuestion.status === 'submitted' || allottedQuestion.status === 'evaluated') {
      return res.status(400).json({ message: 'Question already submitted' });
    }

    allottedQuestion.submittedCode = code;
    allottedQuestion.status = 'submitted';
    allottedQuestion.submittedAt = new Date();

    // Evaluate test cases
    const testCases = allottedQuestion.question.testCases;
    let passedCount = 0;

    // Simple evaluation (in production, use a proper code execution sandbox)
    try {
      for (const testCase of testCases) {
        // This is a simplified evaluation - in production, use a sandbox
        const result = evaluateCode(code, testCase.input);
        if (result === testCase.expectedOutput) {
          passedCount++;
        }
      }
    } catch (error) {
      console.error('Code evaluation error:', error);
    }

    allottedQuestion.testCasesPassed = passedCount;
    allottedQuestion.totalTestCases = testCases.length;
    allottedQuestion.score = (passedCount / testCases.length) * 100;
    allottedQuestion.status = 'evaluated';
    allottedQuestion.evaluatedAt = new Date();

    await allottedQuestion.save();

    res.json({
      message: 'Code submitted successfully',
      testCasesPassed: passedCount,
      totalTestCases: testCases.length,
      score: allottedQuestion.score
    });
  } catch (error) {
    console.error('Submit code error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Simple code evaluation function (placeholder)
function evaluateCode(code, input) {
  // This is a placeholder - in production, use a proper sandbox like Judge0 or similar
  // For now, just return empty string
  return '';
}

// Get team statistics
router.get('/team-stats', auth, async (req, res) => {
  try {
    const stats = await AllottedQuestion.aggregate([
      {
        $group: {
          _id: '$teamName',
          questionsAllotted: { $sum: 1 },
          totalScore: { $sum: '$score' },
          testCasesPassed: { $sum: '$testCasesPassed' }
        }
      },
      { $sort: { questionsAllotted: -1 } }
    ]);

    res.json(stats);
  } catch (error) {
    console.error('Get team stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

