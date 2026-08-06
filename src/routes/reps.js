import express from 'express';
import { CourageRep } from '../db/schema.js';
import { createRepSchema, updateRepSchema } from '../schemas/requests.js';
import crypto from 'crypto';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const reps = await CourageRep.find().sort({ createdAt: 1 });
    res.json(reps);
  } catch (error) {
    console.error('Error fetching reps:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const data = createRepSchema.parse(req.body);
    
    // Check if exact text already exists
    let existing = await CourageRep.findOne({ text: data.text });
    if (existing) {
      return res.json(existing);
    }

    const rep = await CourageRep.create({
      _id: crypto.randomUUID(),
      ...data,
      completions: 0
    });
    res.status(201).json(rep);
  } catch (error) {
    if (error.name === 'ZodError') return res.status(400).json({ error: error.errors });
    console.error('Error creating rep:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const data = updateRepSchema.parse(req.body);
    const rep = await CourageRep.findByIdAndUpdate(
      req.params.id,
      { $set: data },
      { new: true }
    );
    if (!rep) return res.status(404).json({ error: 'Rep not found' });
    res.json(rep);
  } catch (error) {
    if (error.name === 'ZodError') return res.status(400).json({ error: error.errors });
    console.error('Error updating rep:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const rep = await CourageRep.findByIdAndDelete(req.params.id);
    if (!rep) return res.status(404).json({ error: 'Rep not found' });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting rep:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/toggle', async (req, res) => {
  try {
    const { action } = req.body; // 'complete' or 'uncomplete'
    if (action !== 'complete' && action !== 'uncomplete') {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const incValue = action === 'complete' ? 1 : -1;

    // Use $inc but ensure completions doesn't go below 0
    const rep = await CourageRep.findById(req.params.id);
    if (!rep) return res.status(404).json({ error: 'Rep not found' });
    
    rep.completions = Math.max(0, rep.completions + incValue);
    await rep.save();

    res.json(rep);
  } catch (error) {
    console.error('Error toggling rep:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
