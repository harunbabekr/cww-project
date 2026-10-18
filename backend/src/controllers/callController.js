import CallLog from '../models/CallLog.js';

// GET /calls/history
export const history = async (req, res) => {
  const me = String(req.user._id);
  const logs = await CallLog.find({ participants: req.user._id })
    .sort({ startedAt: -1 })
    .limit(60)
    .populate('from to participants', 'name fullPhone');

  const items = logs.map((l) => {
    const outgoing = String(l.from?._id) === me;
    const peer = outgoing ? l.to : l.from;
    const joinedMe = (l.joined || []).some((j) => String(j) === me);
    const missed = !outgoing && (l.kind === 'group' ? !joinedMe : ['missed', 'cancelled'].includes(l.status));
    return {
      id: l._id,
      kind: l.kind,
      video: l.video,
      direction: outgoing ? 'outgoing' : 'incoming',
      status: l.status,
      missed,
      startedAt: l.startedAt,
      duration: l.duration,
      peer: l.kind === 'direct' && peer ? { id: peer._id, name: peer.name, phone: peer.fullPhone } : null,
      members: l.kind === 'group' ? l.participants.filter((p) => String(p._id) !== me).map((p) => ({ id: p._id, name: p.name })) : undefined,
    };
  });
  res.json({ success: true, calls: items });
};

export const clearHistory = async (req, res) => {
  await CallLog.updateMany({ participants: req.user._id }, { $pull: { participants: req.user._id } });
  await CallLog.deleteMany({ participants: { $size: 0 } });
  res.json({ success: true });
};
