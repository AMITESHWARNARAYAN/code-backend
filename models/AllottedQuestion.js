const mongoose = require('mongoose');

const allottedQuestionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  username: String,
  teamName: String,
  question: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true
  },
  auction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Auction',
    required: true
  },
  bidAmount: {
    type: Number,
    required: true
  },
  submittedCode: {
    type: String,
    default: ''
  },
  testCasesPassed: {
    type: Number,
    default: 0
  },
  totalTestCases: {
    type: Number,
    default: 0
  },
  score: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['allotted', 'coding', 'submitted', 'evaluated'],
    default: 'allotted'
  },
  allottedAt: {
    type: Date,
    default: Date.now
  },
  submittedAt: Date,
  evaluatedAt: Date
});

module.exports = mongoose.model('AllottedQuestion', allottedQuestionSchema);

