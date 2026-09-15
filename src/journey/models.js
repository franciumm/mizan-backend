import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  kind: { type: String, enum: ['event', 'playbook', 'overview'], required: true, index: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  revision: { type: Number, default: 0 },
}, { timestamps: true, versionKey: false });

export const JourneyRecord = mongoose.model('JourneyRecord', schema);
