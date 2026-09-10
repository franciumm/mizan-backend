import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  revision: { type: Number, default: 0 },
}, { versionKey: false, timestamps: true });
export const ContentAsset = mongoose.model('ContentAsset', schema.clone());
export const ContentSettings = mongoose.model('ContentSettings', schema.clone());
