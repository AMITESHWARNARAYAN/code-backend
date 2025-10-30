const ScheduledAuction = require('../models/ScheduledAuction');
const AllottedQuestion = require('../models/AllottedQuestion');
const Auction = require('../models/Auction');
const User = require('../models/User');
const Question = require('../models/Question');
const Bid = require('../models/Bid');

let scheduledAuctionTimers = {}; // Store timers for each scheduled auction
let activeScheduledAuctions = {}; // Store active auction states

module.exports = (io) => {
  // Check for scheduled auctions on server start
  checkScheduledAuctions(io);
  
  // Check every minute for auctions that need to start
  setInterval(() => checkScheduledAuctions(io), 60000);

  io.on('connection', (socket) => {
    
    // User joins a scheduled auction room
    socket.on('join-scheduled-auction', async (data) => {
      const { auctionId } = data;
      socket.join(`scheduled-${auctionId}`);
      
      // Send current state
      if (activeScheduledAuctions[auctionId]) {
        socket.emit('scheduled-auction-state', activeScheduledAuctions[auctionId]);
      }
    });

    // User leaves a scheduled auction room
    socket.on('leave-scheduled-auction', (data) => {
      const { auctionId } = data;
      socket.leave(`scheduled-${auctionId}`);
    });

    // Place bid in scheduled auction
    socket.on('scheduled:place-bid', async (data) => {
      try {
        const { auctionId, userId, amount } = data;
        const state = activeScheduledAuctions[auctionId];

        if (!state || !state.isActive) {
          socket.emit('error', { message: 'No active auction' });
          return;
        }

        const user = await User.findById(userId);
        if (!user) {
          socket.emit('error', { message: 'User not found' });
          return;
        }

        if (user.wallet < amount) {
          socket.emit('error', { message: 'Insufficient wallet balance' });
          return;
        }

        if (amount <= state.currentBid.amount) {
          socket.emit('error', { message: 'Bid must be higher than current bid' });
          return;
        }

        // Update current bid in state
        state.currentBid = {
          amount,
          bidder: userId,
          bidderUsername: user.username,
          bidderTeam: user.teamName
        };

        // Save bid to database
        const bid = new Bid({
          auction: state.currentAuctionRecord,
          bidder: userId,
          bidderUsername: user.username,
          bidderTeam: user.teamName,
          amount
        });
        await bid.save();

        // Update auction record with current bid
        const auctionRecord = await Auction.findById(state.currentAuctionRecord);
        if (auctionRecord) {
          auctionRecord.currentBid = {
            amount,
            bidder: userId,
            bidderUsername: user.username,
            bidderTeam: user.teamName
          };
          await auctionRecord.save();
        }

        // Broadcast new bid
        io.to(`scheduled-${auctionId}`).emit('new-bid', {
          amount,
          bidderUsername: user.username,
          bidderTeam: user.teamName,
          timeRemaining: state.timeRemaining
        });

      } catch (error) {
        console.error('Scheduled bid error:', error);
        socket.emit('error', { message: 'Failed to place bid' });
      }
    });
  });
};

async function checkScheduledAuctions(io) {
  try {
    const now = new Date();
    
    // Find auctions that should start now
    const auctionsToStart = await ScheduledAuction.find({
      status: 'scheduled',
      scheduledTime: { $lte: now }
    }).populate('questions');

    for (const auction of auctionsToStart) {
      // Change status to waiting
      auction.status = 'waiting';
      await auction.save();
      
      // Notify users
      io.emit('scheduled-auction-ready', {
        auctionId: auction._id,
        title: auction.title,
        description: auction.description
      });
      
      // Start checking for threshold
      checkThresholdAndStart(io, auction._id.toString());
    }
  } catch (error) {
    console.error('Check scheduled auctions error:', error);
  }
}

async function checkThresholdAndStart(io, auctionId) {
  try {
    const auction = await ScheduledAuction.findById(auctionId)
      .populate('questions')
      .populate('joinedUsers.user');
    
    if (!auction || auction.status !== 'waiting') return;

    // Check if minimum users threshold is met
    if (auction.joinedUsers.length >= auction.minUsers) {
      // Start the auction automatically
      await startScheduledAuction(io, auction);
    } else {
      // Check again after 30 seconds
      setTimeout(() => checkThresholdAndStart(io, auctionId), 30000);
    }
  } catch (error) {
    console.error('Check threshold error:', error);
  }
}

async function startScheduledAuction(io, auction) {
  try {
    auction.status = 'in-progress';
    auction.startedAt = new Date();
    auction.currentQuestionIndex = 0;
    await auction.save();

    const auctionId = auction._id.toString();
    
    // Initialize auction state
    activeScheduledAuctions[auctionId] = {
      scheduledAuctionId: auctionId,
      isActive: false,
      isCodingPhase: false,
      currentQuestionIndex: 0,
      totalQuestions: auction.questions.length,
      timeRemaining: 0,
      currentQuestion: null,
      currentBid: { amount: 0, bidder: null, bidderUsername: '', bidderTeam: '' },
      auctionDuration: auction.auctionDuration,
      codingDuration: auction.codingDuration
    };

    // Notify all joined users that auction is starting
    io.to(`scheduled-${auctionId}`).emit('scheduled-auction-started', {
      auctionId,
      title: auction.title,
      totalQuestions: auction.questions.length
    });

    // Start pushing questions automatically
    await pushNextQuestion(io, auction);

  } catch (error) {
    console.error('Start scheduled auction error:', error);
  }
}

async function pushNextQuestion(io, auction) {
  try {
    const auctionId = auction._id.toString();
    const state = activeScheduledAuctions[auctionId];
    
    if (!state) return;

    // Check if all questions are done
    if (state.currentQuestionIndex >= auction.questions.length) {
      // All questions pushed, start coding phase
      await startCodingPhase(io, auction);
      return;
    }

    const question = auction.questions[state.currentQuestionIndex];
    
    // Create auction record
    const auctionRecord = new Auction({
      question: question._id,
      status: 'active',
      startTime: new Date(),
      timerDuration: auction.auctionDuration
    });
    await auctionRecord.save();

    // Update state
    state.isActive = true;
    state.timeRemaining = auction.auctionDuration;
    state.currentQuestion = {
      id: question._id,
      title: question.title,
      description: question.description,
      difficulty: question.difficulty
    };
    state.currentBid = { amount: 0, bidder: null, bidderUsername: '', bidderTeam: '' };
    state.currentAuctionRecord = auctionRecord._id;

    // Broadcast question
    io.to(`scheduled-${auctionId}`).emit('scheduled-question-pushed', {
      question: state.currentQuestion,
      timeRemaining: state.timeRemaining,
      questionNumber: state.currentQuestionIndex + 1,
      totalQuestions: state.totalQuestions
    });

    // Start timer
    startQuestionTimer(io, auction);

  } catch (error) {
    console.error('Push next question error:', error);
  }
}

function startQuestionTimer(io, auction) {
  const auctionId = auction._id.toString();
  const state = activeScheduledAuctions[auctionId];
  
  if (!state) return;

  // Clear existing timer
  if (scheduledAuctionTimers[auctionId]) {
    clearInterval(scheduledAuctionTimers[auctionId]);
  }

  scheduledAuctionTimers[auctionId] = setInterval(async () => {
    state.timeRemaining--;

    // Broadcast time update
    io.to(`scheduled-${auctionId}`).emit('scheduled-timer-update', { 
      timeRemaining: state.timeRemaining 
    });

    if (state.timeRemaining <= 0) {
      clearInterval(scheduledAuctionTimers[auctionId]);
      await endQuestionAuction(io, auction);
    }
  }, 1000);
}

async function endQuestionAuction(io, auction) {
  try {
    const auctionId = auction._id.toString();
    const state = activeScheduledAuctions[auctionId];
    
    if (!state) return;

    // Update auction record
    const auctionRecord = await Auction.findById(state.currentAuctionRecord);
    if (auctionRecord) {
      auctionRecord.status = 'completed';
      auctionRecord.endTime = new Date();

      if (state.currentBid.bidder) {
        auctionRecord.winner = state.currentBid.bidder;
        auctionRecord.winningBid = state.currentBid.amount;
        await auctionRecord.save();

        // Deduct from winner's wallet
        const winner = await User.findById(state.currentBid.bidder);
        if (winner) {
          winner.wallet -= state.currentBid.amount;
          await winner.save();

          // Create allotted question
          const allottedQuestion = new AllottedQuestion({
            user: winner._id,
            username: winner.username,
            teamName: winner.teamName,
            question: state.currentQuestion.id,
            bidAmount: state.currentBid.amount,
            status: 'allotted'
          });
          await allottedQuestion.save();

          // Broadcast auction end
          io.to(`scheduled-${auctionId}`).emit('scheduled-auction-ended', {
            winner: {
              username: winner.username,
              teamName: winner.teamName,
              amount: state.currentBid.amount
            },
            question: state.currentQuestion
          });
        }
      } else {
        await auctionRecord.save();
        io.to(`scheduled-${auctionId}`).emit('scheduled-auction-ended', { 
          winner: null, 
          question: state.currentQuestion 
        });
      }
    }

    // Reset state
    state.isActive = false;
    state.currentBid = { amount: 0, bidder: null, bidderUsername: '', bidderTeam: '' };
    state.currentQuestionIndex++;

    // Update database
    const updatedAuction = await ScheduledAuction.findById(auctionId).populate('questions');
    if (updatedAuction) {
      updatedAuction.currentQuestionIndex = state.currentQuestionIndex;
      await updatedAuction.save();

      // Wait 3 seconds then push next question
      setTimeout(() => pushNextQuestion(io, updatedAuction), 3000);
    }

  } catch (error) {
    console.error('End question auction error:', error);
  }
}

async function startCodingPhase(io, auction) {
  try {
    const auctionId = auction._id.toString();
    const state = activeScheduledAuctions[auctionId];
    
    if (!state) return;

    // Get all allotted questions for this scheduled auction's participants
    const joinedUserIds = auction.joinedUsers.map(ju => ju.user._id);
    
    const allottedQuestions = await AllottedQuestion.find({ 
      user: { $in: joinedUserIds },
      status: 'allotted'
    })
      .populate('question')
      .populate('user');

    if (allottedQuestions.length === 0) {
      // No one won any questions, end auction
      await endScheduledAuction(io, auction);
      return;
    }

    // Update state
    state.isCodingPhase = true;
    state.timeRemaining = auction.codingDuration;

    // Update all to coding status
    for (const allotted of allottedQuestions) {
      allotted.status = 'coding';
      await allotted.save();
    }

    // Group questions by user
    const userQuestions = {};
    for (const allotted of allottedQuestions) {
      const userId = allotted.user._id.toString();
      if (!userQuestions[userId]) {
        userQuestions[userId] = [];
      }
      userQuestions[userId].push({
        allottedQuestionId: allotted._id,
        question: {
          id: allotted.question._id,
          title: allotted.question.title,
          description: allotted.question.description,
          difficulty: allotted.question.difficulty,
          starterCode: allotted.question.starterCode,
          testCases: allotted.question.testCases.map(tc => ({
            input: tc.input,
            expectedOutput: tc.expectedOutput
          }))
        }
      });
    }

    // Send to users
    for (const [userId, questions] of Object.entries(userQuestions)) {
      io.to(`scheduled-${auctionId}`).emit('scheduled-coding-started', {
        userId,
        questions,
        timeRemaining: auction.codingDuration
      });
    }

    // Start coding timer
    startCodingTimer(io, auction);

  } catch (error) {
    console.error('Start coding phase error:', error);
  }
}

function startCodingTimer(io, auction) {
  const auctionId = auction._id.toString();
  const state = activeScheduledAuctions[auctionId];
  
  if (!state) return;

  const timerKey = `${auctionId}-coding`;
  
  if (scheduledAuctionTimers[timerKey]) {
    clearInterval(scheduledAuctionTimers[timerKey]);
  }

  scheduledAuctionTimers[timerKey] = setInterval(async () => {
    state.timeRemaining--;

    io.to(`scheduled-${auctionId}`).emit('scheduled-coding-timer-update', { 
      timeRemaining: state.timeRemaining 
    });

    if (state.timeRemaining <= 0) {
      clearInterval(scheduledAuctionTimers[timerKey]);
      await endCodingPhase(io, auction);
    }
  }, 1000);
}

async function endCodingPhase(io, auction) {
  try {
    const auctionId = auction._id.toString();
    
    // Auto-submit all pending questions
    const pendingQuestions = await AllottedQuestion.find({ status: 'coding' })
      .populate('question')
      .populate('user');

    for (const allotted of pendingQuestions) {
      allotted.status = 'submitted';
      allotted.submittedAt = new Date();
      allotted.testCasesPassed = 0;
      allotted.totalTestCases = allotted.question.testCases.length;
      allotted.score = 0;
      allotted.status = 'evaluated';
      allotted.evaluatedAt = new Date();
      await allotted.save();
    }

    // Calculate results
    await calculateResults(io, auction);

  } catch (error) {
    console.error('End coding phase error:', error);
  }
}

async function calculateResults(io, auction) {
  try {
    const auctionId = auction._id.toString();
    const joinedUserIds = auction.joinedUsers.map(ju => ju.user._id);

    // Get all evaluated questions for participants
    const userResults = await AllottedQuestion.aggregate([
      { 
        $match: { 
          user: { $in: joinedUserIds },
          status: 'evaluated'
        } 
      },
      {
        $group: {
          _id: '$user',
          username: { $first: '$username' },
          teamName: { $first: '$teamName' },
          totalScore: { $sum: '$score' },
          questionsWon: { $sum: 1 },
          questionsCompleted: { 
            $sum: { $cond: [{ $gt: ['$score', 0] }, 1, 0] } 
          }
        }
      },
      { $sort: { totalScore: -1, questionsCompleted: -1 } }
    ]);

    // Add ranks
    const results = userResults.map((result, index) => ({
      user: result._id,
      username: result.username,
      teamName: result.teamName,
      totalScore: result.totalScore,
      questionsWon: result.questionsWon,
      questionsCompleted: result.questionsCompleted,
      rank: index + 1
    }));

    // Update auction with results
    auction.results = results;
    auction.status = 'completed';
    auction.completedAt = new Date();
    await auction.save();

    // Broadcast results
    io.to(`scheduled-${auctionId}`).emit('scheduled-auction-completed', {
      results: results.slice(0, 10) // Top 10
    });

    // Cleanup
    delete activeScheduledAuctions[auctionId];
    Object.keys(scheduledAuctionTimers).forEach(key => {
      if (key.startsWith(auctionId)) {
        clearInterval(scheduledAuctionTimers[key]);
        delete scheduledAuctionTimers[key];
      }
    });

  } catch (error) {
    console.error('Calculate results error:', error);
  }
}

async function endScheduledAuction(io, auction) {
  const auctionId = auction._id.toString();
  
  auction.status = 'completed';
  auction.completedAt = new Date();
  await auction.save();

  io.to(`scheduled-${auctionId}`).emit('scheduled-auction-completed', {
    results: []
  });

  delete activeScheduledAuctions[auctionId];
}

