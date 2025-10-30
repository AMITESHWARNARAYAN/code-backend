const Auction = require('../models/Auction');
const AllottedQuestion = require('../models/AllottedQuestion');
const User = require('../models/User');
const Question = require('../models/Question');
const Bid = require('../models/Bid');

let currentAuction = null;
let auctionTimer = null;
let codingTimer = null;
let auctionState = {
  isActive: false,
  isCodingPhase: false,
  timeRemaining: 0,
  currentQuestion: null,
  currentBid: { amount: 0, bidder: null, bidderUsername: '', bidderTeam: '' }
};

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Send current auction state to newly connected user
    socket.emit('auction-state', auctionState);

    // Admin pushes a question to start auction
    socket.on('admin:push-question', async (data) => {
      try {
        const { questionId, adminId } = data;

        // Verify admin
        const admin = await User.findById(adminId);
        if (!admin || admin.role !== 'admin') {
          socket.emit('error', { message: 'Unauthorized' });
          return;
        }

        // Get question
        const question = await Question.findById(questionId);
        if (!question) {
          socket.emit('error', { message: 'Question not found' });
          return;
        }

        // Create new auction
        currentAuction = new Auction({
          question: questionId,
          status: 'active',
          startTime: new Date(),
          timerDuration: 60
        });
        await currentAuction.save();

        // Update auction state
        auctionState = {
          isActive: true,
          isCodingPhase: false,
          timeRemaining: 60,
          currentQuestion: {
            id: question._id,
            title: question.title,
            description: question.description,
            difficulty: question.difficulty
          },
          currentBid: { amount: 0, bidder: null, bidderUsername: '', bidderTeam: '' }
        };

        // Broadcast question to all users
        io.emit('question-pushed', {
          question: {
            id: question._id,
            title: question.title,
            description: question.description,
            difficulty: question.difficulty
          },
          timeRemaining: 60
        });

        // Start timer
        startAuctionTimer(io);

      } catch (error) {
        console.error('Push question error:', error);
        socket.emit('error', { message: 'Failed to push question' });
      }
    });

    // User places a bid
    socket.on('user:place-bid', async (data) => {
      try {
        const { userId, amount } = data;

        if (!auctionState.isActive || auctionState.isCodingPhase) {
          socket.emit('error', { message: 'No active auction' });
          return;
        }

        // Get user
        const user = await User.findById(userId);
        if (!user) {
          socket.emit('error', { message: 'User not found' });
          return;
        }

        // Check if user has enough balance
        if (user.wallet < amount) {
          socket.emit('error', { message: 'Insufficient balance' });
          return;
        }

        // Check if bid is higher than current bid
        if (amount <= auctionState.currentBid.amount) {
          socket.emit('error', { message: 'Bid must be higher than current bid' });
          return;
        }

        // Update current bid
        auctionState.currentBid = {
          amount,
          bidder: userId,
          bidderUsername: user.username,
          bidderTeam: user.teamName
        };

        // Save bid to database
        const bid = new Bid({
          auction: currentAuction._id,
          bidder: userId,
          bidderUsername: user.username,
          bidderTeam: user.teamName,
          amount
        });
        await bid.save();

        // Update auction
        currentAuction.currentBid = {
          amount,
          bidder: userId,
          bidderUsername: user.username,
          bidderTeam: user.teamName
        };
        await currentAuction.save();

        // Broadcast new bid to all users
        io.emit('new-bid', {
          amount,
          bidderUsername: user.username,
          bidderTeam: user.teamName,
          timeRemaining: auctionState.timeRemaining
        });

      } catch (error) {
        console.error('Place bid error:', error);
        socket.emit('error', { message: 'Failed to place bid' });
      }
    });

    // Admin starts coding phase
    socket.on('admin:start-coding', async (data) => {
      try {
        const { adminId } = data;

        // Verify admin
        const admin = await User.findById(adminId);
        if (!admin || admin.role !== 'admin') {
          socket.emit('error', { message: 'Unauthorized' });
          return;
        }

        // Check team elimination logic
        const eliminationResult = await checkTeamElimination();

        if (eliminationResult.eliminatedTeams.length > 0) {
          io.emit('teams-eliminated', {
            eliminatedTeams: eliminationResult.eliminatedTeams,
            qualifiedTeams: eliminationResult.qualifiedTeams
          });
        }

        // Get all qualified users with allotted questions
        const allottedQuestions = await AllottedQuestion.find({ status: 'allotted' })
          .populate('question')
          .populate('user');

        // Update state
        auctionState.isCodingPhase = true;
        auctionState.timeRemaining = 900; // 15 minutes = 900 seconds

        // Update all allotted questions to coding status
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

        // Send all questions to respective qualified users
        for (const [userId, questions] of Object.entries(userQuestions)) {
          io.emit('coding-started', {
            userId: userId,
            questions: questions,
            timeRemaining: 900
          });
        }

        // Start coding timer
        startCodingTimer(io);

      } catch (error) {
        console.error('Start coding error:', error);
        socket.emit('error', { message: 'Failed to start coding phase' });
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });
};

function startAuctionTimer(io) {
  if (auctionTimer) {
    clearInterval(auctionTimer);
  }

  auctionTimer = setInterval(async () => {
    auctionState.timeRemaining--;

    // Broadcast time update
    io.emit('timer-update', { timeRemaining: auctionState.timeRemaining });

    if (auctionState.timeRemaining <= 0) {
      clearInterval(auctionTimer);
      await endAuction(io);
    }
  }, 1000);
}

async function endAuction(io) {
  try {
    if (!currentAuction) return;

    // Update auction status
    currentAuction.status = 'completed';
    currentAuction.endTime = new Date();

    if (auctionState.currentBid.bidder) {
      currentAuction.winner = auctionState.currentBid.bidder;
      currentAuction.winningAmount = auctionState.currentBid.amount;
      await currentAuction.save();

      // Deduct amount from winner's wallet
      const winner = await User.findById(auctionState.currentBid.bidder);
      winner.wallet -= auctionState.currentBid.amount;
      await winner.save();

      // Create allotted question
      const allottedQuestion = new AllottedQuestion({
        user: winner._id,
        username: winner.username,
        teamName: winner.teamName,
        question: currentAuction.question,
        auction: currentAuction._id,
        bidAmount: auctionState.currentBid.amount,
        status: 'allotted'
      });
      await allottedQuestion.save();

      // Broadcast auction end
      io.emit('auction-ended', {
        winner: {
          username: winner.username,
          teamName: winner.teamName,
          amount: auctionState.currentBid.amount
        },
        question: auctionState.currentQuestion
      });
    } else {
      await currentAuction.save();
      io.emit('auction-ended', { winner: null, question: auctionState.currentQuestion });
    }

    // Reset auction state
    auctionState.isActive = false;
    auctionState.currentBid = { amount: 0, bidder: null, bidderUsername: '', bidderTeam: '' };
    currentAuction = null;

  } catch (error) {
    console.error('End auction error:', error);
  }
}

function startCodingTimer(io) {
  if (codingTimer) {
    clearInterval(codingTimer);
  }

  codingTimer = setInterval(async () => {
    auctionState.timeRemaining--;

    io.emit('coding-timer-update', { timeRemaining: auctionState.timeRemaining });

    if (auctionState.timeRemaining <= 0) {
      clearInterval(codingTimer);
      await endCodingPhase(io);
    }
  }, 1000);
}

async function endCodingPhase(io) {
  try {
    // Auto-submit all pending questions
    const pendingQuestions = await AllottedQuestion.find({ status: 'coding' })
      .populate('question');

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

    // Get top 3 performers
    const topPerformers = await AllottedQuestion.find({ status: 'evaluated' })
      .sort({ score: -1, testCasesPassed: -1 })
      .limit(3)
      .populate('user', 'username teamName');

    io.emit('coding-ended', {
      topPerformers: topPerformers.map(p => ({
        username: p.username,
        teamName: p.teamName,
        score: p.score,
        testCasesPassed: p.testCasesPassed,
        totalTestCases: p.totalTestCases
      }))
    });

    auctionState.isCodingPhase = false;

  } catch (error) {
    console.error('End coding phase error:', error);
  }
}

async function checkTeamElimination() {
  try {
    // Get total questions and teams
    const totalQuestions = await Auction.countDocuments({ status: 'completed' });
    const teams = await User.distinct('teamName', { role: 'user' });
    const totalTeams = teams.length;

    if (totalTeams === 0) {
      return { eliminatedTeams: [], qualifiedTeams: [] };
    }

    const minQuestionsPerTeam = Math.floor(totalQuestions / totalTeams);

    // Get questions allotted per team
    const teamStats = await AllottedQuestion.aggregate([
      {
        $group: {
          _id: '$teamName',
          questionsAllotted: { $sum: 1 }
        }
      }
    ]);

    const eliminatedTeams = [];
    const qualifiedTeams = [];

    for (const team of teams) {
      const teamStat = teamStats.find(t => t._id === team);
      const questionsAllotted = teamStat ? teamStat.questionsAllotted : 0;

      if (questionsAllotted < minQuestionsPerTeam) {
        eliminatedTeams.push(team);
        // Deactivate team members
        await User.updateMany({ teamName: team }, { isActive: false });
      } else {
        qualifiedTeams.push(team);
      }
    }

    return { eliminatedTeams, qualifiedTeams };
  } catch (error) {
    console.error('Check team elimination error:', error);
    return { eliminatedTeams: [], qualifiedTeams: [] };
  }
}

