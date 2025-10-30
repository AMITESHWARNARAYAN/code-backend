const mongoose = require('mongoose');

const auctionSchema = new mongoose.Schema({
  question: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'completed'],
    default: 'pending'
  },
  currentBid: {
    amount: {
      type: Number,
      default: 0
    },
    bidder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    bidderUsername: String,
    bidderTeam: String
  },
  winner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  winningAmount: {
    type: Number,
    default: 0
  },
  startTime: Date,
  endTime: Date,
  timerDuration: {
    type: Number,
    default: 60 // seconds
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Auction', auctionSchema);

