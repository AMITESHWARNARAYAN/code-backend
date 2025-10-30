const express = require('express');
const router = express.Router();
const ScheduledAuction = require('../models/ScheduledAuction');
const Question = require('../models/Question');
const { auth, adminAuth } = require('../middleware/auth');

// Get all scheduled auctions (for users)
router.get('/', auth, async (req, res) => {
  try {
    const auctions = await ScheduledAuction.find({
      status: { $in: ['scheduled', 'waiting'] },
      scheduledTime: { $gte: new Date() }
    })
      .populate('questions', 'title difficulty')
      .populate('createdBy', 'username')
      .sort({ scheduledTime: 1 });

    res.json(auctions);
  } catch (error) {
    console.error('Get scheduled auctions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single scheduled auction
router.get('/:id', auth, async (req, res) => {
  try {
    const auction = await ScheduledAuction.findById(req.params.id)
      .populate('questions', 'title difficulty description')
      .populate('joinedUsers.user', 'username teamName')
      .populate('createdBy', 'username');

    if (!auction) {
      return res.status(404).json({ message: 'Scheduled auction not found' });
    }

    res.json(auction);
  } catch (error) {
    console.error('Get scheduled auction error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create scheduled auction (admin only)
router.post('/create', adminAuth, async (req, res) => {
  try {
    const {
      title,
      description,
      scheduledTime,
      questions,
      minUsers,
      maxUsers,
      auctionDuration,
      codingDuration
    } = req.body;

    // Validate questions exist
    const questionDocs = await Question.find({ _id: { $in: questions } });
    if (questionDocs.length !== questions.length) {
      return res.status(400).json({ message: 'Some questions not found' });
    }

    const scheduledAuction = new ScheduledAuction({
      title,
      description,
      scheduledTime: new Date(scheduledTime),
      questions,
      minUsers: minUsers || 2,
      maxUsers: maxUsers || null,
      auctionDuration: auctionDuration || 60,
      codingDuration: codingDuration || 900,
      createdBy: req.user.id
    });

    await scheduledAuction.save();

    res.status(201).json({
      message: 'Scheduled auction created successfully',
      auction: scheduledAuction
    });
  } catch (error) {
    console.error('Create scheduled auction error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update scheduled auction (admin only)
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const auction = await ScheduledAuction.findById(req.params.id);
    
    if (!auction) {
      return res.status(404).json({ message: 'Scheduled auction not found' });
    }

    if (auction.status !== 'scheduled') {
      return res.status(400).json({ message: 'Cannot update auction that has started' });
    }

    const {
      title,
      description,
      scheduledTime,
      questions,
      minUsers,
      maxUsers,
      auctionDuration,
      codingDuration
    } = req.body;

    if (title) auction.title = title;
    if (description) auction.description = description;
    if (scheduledTime) auction.scheduledTime = new Date(scheduledTime);
    if (questions) auction.questions = questions;
    if (minUsers) auction.minUsers = minUsers;
    if (maxUsers !== undefined) auction.maxUsers = maxUsers;
    if (auctionDuration) auction.auctionDuration = auctionDuration;
    if (codingDuration) auction.codingDuration = codingDuration;

    await auction.save();

    res.json({
      message: 'Scheduled auction updated successfully',
      auction
    });
  } catch (error) {
    console.error('Update scheduled auction error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete scheduled auction (admin only)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const auction = await ScheduledAuction.findById(req.params.id);
    
    if (!auction) {
      return res.status(404).json({ message: 'Scheduled auction not found' });
    }

    if (auction.status !== 'scheduled') {
      return res.status(400).json({ message: 'Cannot delete auction that has started' });
    }

    await auction.deleteOne();

    res.json({ message: 'Scheduled auction deleted successfully' });
  } catch (error) {
    console.error('Delete scheduled auction error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Join scheduled auction (user)
router.post('/:id/join', auth, async (req, res) => {
  try {
    const auction = await ScheduledAuction.findById(req.params.id);
    
    if (!auction) {
      return res.status(404).json({ message: 'Scheduled auction not found' });
    }

    if (auction.status !== 'scheduled' && auction.status !== 'waiting') {
      return res.status(400).json({ message: 'Cannot join auction that has started or completed' });
    }

    // Check if already joined
    const alreadyJoined = auction.joinedUsers.some(
      ju => ju.user.toString() === req.user.id
    );

    if (alreadyJoined) {
      return res.status(400).json({ message: 'Already joined this auction' });
    }

    // Check max users
    if (auction.maxUsers && auction.joinedUsers.length >= auction.maxUsers) {
      return res.status(400).json({ message: 'Auction is full' });
    }

    auction.joinedUsers.push({
      user: req.user.id,
      joinedAt: new Date()
    });

    await auction.save();

    // Emit socket event for real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('user-joined-scheduled', {
        auctionId: auction._id,
        userId: req.user.id,
        username: req.user.username,
        currentCount: auction.joinedUsers.length,
        minUsers: auction.minUsers
      });
    }

    res.json({
      message: 'Joined auction successfully',
      currentCount: auction.joinedUsers.length,
      minUsers: auction.minUsers
    });
  } catch (error) {
    console.error('Join scheduled auction error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Leave scheduled auction (user)
router.post('/:id/leave', auth, async (req, res) => {
  try {
    const auction = await ScheduledAuction.findById(req.params.id);
    
    if (!auction) {
      return res.status(404).json({ message: 'Scheduled auction not found' });
    }

    if (auction.status !== 'scheduled' && auction.status !== 'waiting') {
      return res.status(400).json({ message: 'Cannot leave auction that has started' });
    }

    auction.joinedUsers = auction.joinedUsers.filter(
      ju => ju.user.toString() !== req.user.id
    );

    await auction.save();

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('user-left-scheduled', {
        auctionId: auction._id,
        userId: req.user.id,
        currentCount: auction.joinedUsers.length
      });
    }

    res.json({ message: 'Left auction successfully' });
  } catch (error) {
    console.error('Leave scheduled auction error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all scheduled auctions (admin view)
router.get('/admin/all', adminAuth, async (req, res) => {
  try {
    const auctions = await ScheduledAuction.find()
      .populate('questions', 'title difficulty')
      .populate('createdBy', 'username')
      .sort({ scheduledTime: -1 });

    res.json(auctions);
  } catch (error) {
    console.error('Get all scheduled auctions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Cancel scheduled auction (admin only)
router.post('/:id/cancel', adminAuth, async (req, res) => {
  try {
    const auction = await ScheduledAuction.findById(req.params.id);
    
    if (!auction) {
      return res.status(404).json({ message: 'Scheduled auction not found' });
    }

    if (auction.status === 'completed') {
      return res.status(400).json({ message: 'Cannot cancel completed auction' });
    }

    auction.status = 'cancelled';
    await auction.save();

    // Notify all joined users
    const io = req.app.get('io');
    if (io) {
      io.emit('scheduled-auction-cancelled', {
        auctionId: auction._id,
        title: auction.title
      });
    }

    res.json({ message: 'Auction cancelled successfully' });
  } catch (error) {
    console.error('Cancel scheduled auction error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

