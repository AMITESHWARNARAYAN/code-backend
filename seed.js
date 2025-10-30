const mongoose = require('mongoose');
const User = require('./models/User');
const Question = require('./models/Question');
require('dotenv').config();

const seedDatabase = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');

    // Clear existing data
    await User.deleteMany({});
    await Question.deleteMany({});
    console.log('Cleared existing data');

    // Create admin user
    const admin = new User({
      username: 'admin',
      email: 'admin@auction.com',
      password: 'admin123',
      teamName: 'Admin Team',
      role: 'admin',
      wallet: 1000
    });
    await admin.save();
    console.log('Admin user created:');
    console.log('  Email: admin@auction.com');
    console.log('  Password: admin123');

    // Create sample users
    const users = [
      {
        username: 'user1',
        email: 'user1@auction.com',
        password: 'user123',
        teamName: 'Team Alpha',
        role: 'user',
        wallet: 200
      },
      {
        username: 'user2',
        email: 'user2@auction.com',
        password: 'user123',
        teamName: 'Team Beta',
        role: 'user',
        wallet: 200
      },
      {
        username: 'user3',
        email: 'user3@auction.com',
        password: 'user123',
        teamName: 'Team Gamma',
        role: 'user',
        wallet: 200
      }
    ];

    for (const userData of users) {
      const user = new User(userData);
      await user.save();
      console.log(`User created: ${userData.email} / ${userData.password}`);
    }

    // Create sample questions
    const questions = [
      {
        title: 'Two Sum',
        description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.\n\nYou can return the answer in any order.',
        difficulty: 'Easy',
        tags: ['array', 'hash-table'],
        testCases: [
          { input: '[2,7,11,15], 9', expectedOutput: '[0,1]' },
          { input: '[3,2,4], 6', expectedOutput: '[1,2]' },
          { input: '[3,3], 6', expectedOutput: '[0,1]' }
        ],
        starterCode: 'function twoSum(nums, target) {\n  // Your code here\n}',
        createdBy: admin._id
      },
      {
        title: 'Reverse String',
        description: 'Write a function that reverses a string. The input string is given as an array of characters s.\n\nYou must do this by modifying the input array in-place with O(1) extra memory.',
        difficulty: 'Easy',
        tags: ['string', 'two-pointers'],
        testCases: [
          { input: '["h","e","l","l","o"]', expectedOutput: '["o","l","l","e","h"]' },
          { input: '["H","a","n","n","a","h"]', expectedOutput: '["h","a","n","n","a","H"]' }
        ],
        starterCode: 'function reverseString(s) {\n  // Your code here\n}',
        createdBy: admin._id
      },
      {
        title: 'Valid Parentheses',
        description: 'Given a string s containing just the characters \'(\', \')\', \'{\', \'}\', \'[\' and \']\', determine if the input string is valid.\n\nAn input string is valid if:\n1. Open brackets must be closed by the same type of brackets.\n2. Open brackets must be closed in the correct order.\n3. Every close bracket has a corresponding open bracket of the same type.',
        difficulty: 'Medium',
        tags: ['string', 'stack'],
        testCases: [
          { input: '()', expectedOutput: 'true' },
          { input: '()[]{}', expectedOutput: 'true' },
          { input: '(]', expectedOutput: 'false' },
          { input: '([)]', expectedOutput: 'false' }
        ],
        starterCode: 'function isValid(s) {\n  // Your code here\n}',
        createdBy: admin._id
      },
      {
        title: 'Merge Two Sorted Lists',
        description: 'You are given the heads of two sorted linked lists list1 and list2.\n\nMerge the two lists into one sorted list. The list should be made by splicing together the nodes of the first two lists.\n\nReturn the head of the merged linked list.',
        difficulty: 'Medium',
        tags: ['linked-list', 'recursion'],
        testCases: [
          { input: '[1,2,4], [1,3,4]', expectedOutput: '[1,1,2,3,4,4]' },
          { input: '[], []', expectedOutput: '[]' },
          { input: '[], [0]', expectedOutput: '[0]' }
        ],
        starterCode: 'function mergeTwoLists(list1, list2) {\n  // Your code here\n}',
        createdBy: admin._id
      },
      {
        title: 'Maximum Subarray',
        description: 'Given an integer array nums, find the subarray with the largest sum, and return its sum.',
        difficulty: 'Hard',
        tags: ['array', 'dynamic-programming', 'divide-and-conquer'],
        testCases: [
          { input: '[-2,1,-3,4,-1,2,1,-5,4]', expectedOutput: '6' },
          { input: '[1]', expectedOutput: '1' },
          { input: '[5,4,-1,7,8]', expectedOutput: '23' }
        ],
        starterCode: 'function maxSubArray(nums) {\n  // Your code here\n}',
        createdBy: admin._id
      }
    ];

    for (const questionData of questions) {
      const question = new Question(questionData);
      await question.save();
      console.log(`Question created: ${questionData.title}`);
    }

    console.log('\n✅ Database seeded successfully!');
    console.log('\nYou can now login with:');
    console.log('Admin - admin@auction.com / admin123');
    console.log('User1 - user1@auction.com / user123');
    console.log('User2 - user2@auction.com / user123');
    console.log('User3 - user3@auction.com / user123');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

seedDatabase();

