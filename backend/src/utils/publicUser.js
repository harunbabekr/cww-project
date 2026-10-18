import User from '../models/User.js';

export const publicUser = async (user) => {
  const u = await User.findById(user._id).select('+voice.voiceId');
  return user.toPublic(!!u?.voice?.voiceId);
};
