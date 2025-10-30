const mongoose = require('mongoose');

const scheduledAuctionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  scheduledTime: {
    type: Date,
    required: true
  },
  questions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question'
  }],
  minUsers: {
    type: Number,
    required: true,
    default: 2
  },
  maxUsers: {
    type: Number,
    default: null // null means unlimited
  },
  auctionDuration: {
    type: Number,
    default: 60 // seconds per question auction
  },
  codingDuration: {
    type: Number,
    default: 900 // 15 minutes in seconds
  },
  status: {
    type: String,
    enum: ['scheduled', 'waiting', 'in-progress', 'completed', 'cancelled'],
    default: 'scheduled'
  },
  joinedUsers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  currentQuestionIndex: {
    type: Number,
    default: 0
  },
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  results: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    username: String,
    teamName: String,
    totalScore: Number,
    questionsWon: Number,
    questionsCompleted: Number,
    rank: Number
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
scheduledAuctionSchema.index({ scheduledTime: 1, status: 1 });
scheduledAuctionSchema.index({ status: 1 });

module.exports = mongoose.model('ScheduledAuction', scheduledAuctionSchema);

