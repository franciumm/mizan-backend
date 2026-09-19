import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  store: { type: mongoose.Schema.Types.Mixed, required: true },
  revision: { type: Number, required: true, default: 0 },
}, { timestamps: true, versionKey: false, minimize: false });

export const LifeOSRecord = mongoose.model('LifeOSRecord', schema);
