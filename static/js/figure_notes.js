// Hover/tap notes for the two HTML architecture figures (static/figures/). Each entry is a
// hotspot in the figure's native pixel coordinates, [x, y, width, height], measured from the
// rendered figure; `link` makes the hotspot jump to another figure or section.
// If a figure's layout changes, these rectangles have to be re-measured.
window.FIGURE_NOTES = {
  // Figure 1: static/figures/wave_architecture.html (1600 x 700)
  overview: [
    {
      rect: [150, 120, 66, 250],
      title: 'Object vectors \\(s\\)',
      body: 'The state of the multi-object task \\(M_N\\): one vector per object with its state and goal. Its size grows with \\(N\\), so no learned part of WAVE reads it whole.',
    },
    {
      rect: [216, 120, 64, 254],
      title: 'Selected object \\(x^*\\)',
      body: 'The object the selection policy is working on. Its state and goal tokens are the only object the frozen skill is shown.',
    },
    {
      rect: [322, 30, 178, 70],
      title: 'Crop \\(\\chi(s, x^*)\\)',
      body: 'A fixed-width local view around \\(x^*\\): its position and goal, the robot state, the skill\'s action on the unwarped input, and geometric features of every other object within a fixed range. Thirty cubes produce the same kind of input as nine.',
      link: { href: '#warping-policy', label: 'See how the crop is encoded' },
    },
    {
      rect: [528, 26, 876, 92],
      title: 'Warping policy \\(\\psi\\)',
      body: 'Reads the crop at every control step and emits one multiplier and one offset \\((m_j, o_j)\\) for every input and action channel of the skill. Trained with PPO on the multi-object reward, using the skill as a black box.',
      link: { href: '#warping-policy', label: 'Open its architecture (Figure 2)' },
    },
    {
      rect: [614, 196, 206, 92],
      title: 'Input warp \\(W_{\\mathrm{in}}\\)',
      body: 'Applies \\(\\tilde z_j = m_j z_j + o_j\\) to every channel the skill reads. Editing the input makes the skill itself compute a corrected action, for example a detour around a stack. Warping only the input nearly matches the full warp.',
      link: { href: '#ablations', label: 'See the warp-side ablation' },
    },
    {
      rect: [811, 194, 282, 97],
      title: 'Per-channel affine edit',
      body: 'At \\(m_j = 1, o_j = 0\\) a channel passes through unchanged. At \\(m_j = 0\\) its value is removed and \\(o_j\\) replaces it, so the warping policy takes the channel over.',
    },
    {
      rect: [1084, 196, 250, 92],
      title: 'Output warp \\(W_{\\mathrm{out}}\\)',
      body: 'Edits every action channel of the skill the same way. It produces behavior the skill never learned, such as releasing a cube on top of a stack. Warping only the output collapses by ten cubes.',
      link: { href: '#ablations', label: 'See the warp-side ablation' },
    },
    {
      rect: [318, 356, 212, 122],
      title: 'Selection policy',
      body: 'Scores every object that is not at its goal with a shared MLP: a bounded priority \\(f_i\\) and a learned feasibility \\(\\hat p_i\\). It picks \\(x^* = \\arg\\max_i\\, \\beta \\tanh f_i - \\alpha(\\tilde d_i + \\ell_i / \\hat p_i) + \\theta_i\\), starting from shortest path first, and decides again whenever a cube is placed or knocked off.',
      link: { href: '#selection-policy', label: 'How it chooses and learns the order' },
    },
    {
      rect: [552, 368, 64, 254],
      title: 'Presentation \\(s_1 = \\sigma(s, x^*)\\)',
      body: 'The state and goal the skill would see in the single-object task if \\(x^*\\) were the only object, with nothing about the other objects. It is expressed relative to the robot, so it stays inside the skill\'s training distribution.',
    },
    {
      rect: [674, 365, 62, 258],
      title: 'Warped state \\(\\tilde s_1\\)',
      body: 'The input the frozen skill actually receives, \\(\\tilde s_1 = W_{\\mathrm{in}}(s_1; u)\\). The warp steers the skill around the objects it is not shown.',
    },
    {
      rect: [776, 440, 236, 100],
      title: 'Skill policy \\(\\mu\\) (frozen)',
      body: 'A pretrained goal-conditioned policy that moves one object to its goal. Its weights are never updated. WAVE only needs it to be trained on the same robot and its input layout to be known.',
    },
    {
      rect: [1060, 369, 66, 248],
      title: 'Skill action \\(\\tilde a\\)',
      body: 'The frozen skill\'s action on the warped state, before the output warp.',
    },
    {
      rect: [1180, 366, 68, 256],
      title: 'Executed action \\(a\\)',
      body: 'The action sent to the robot, \\(a = W_{\\mathrm{out}}(\\tilde a; u)\\): servo-target deltas.',
    },
    {
      rect: [110, 470, 204, 144],
      title: 'Environment \\(M_N\\)',
      body: 'The multi-object scene. Policies train on one to six to nine cubes and are evaluated zero-shot on up to thirty.',
      link: { href: '#results', label: 'See every task' },
    },
  ],

  // Figure 2: static/figures/warp_architecture.html (1126 x 586)
  warp: [
    {
      rect: [28, 58, 184, 149],
      title: 'Core token',
      body: 'The selected object\'s state and goal, the robot state, the frozen skill\'s action on the unwarped presentation, and the warp applied at the previous step.',
    },
    {
      rect: [28, 239, 184, 96],
      title: 'Pair rows',
      body: 'One row of geometric features for every other object: its position relative to \\(x^*\\), to the goal of \\(x^*\\) and to the robot, and whether it is placed. Objects beyond a fixed range from \\(x^*\\) are masked.',
    },
    {
      rect: [234, 244, 80, 96],
      title: 'Per-pair MLP (shared)',
      body: 'Maps every pair row to a fixed number of bounded scores.',
    },
    {
      rect: [326, 157, 148, 189],
      title: 'Elementwise minimum',
      body: 'Reduces the per-object scores to one neighborhood encoding. The closest obstacle is the one an attempt is most likely to hit, and a neighbor five centimeters away yields the same score among three objects and among thirty. A mean or softmax would dilute as \\(N\\) grows.',
    },
    {
      rect: [538, 118, 118, 101],
      title: 'Encoder',
      body: 'Self-attention over two tokens: the core token and the neighborhood encoding.',
    },
    {
      rect: [662, 58, 220, 99],
      title: 'Channel-group queries',
      body: 'One learned query per channel group, the channels that carry one physical quantity: the presented goal, the object state, the robot state and the action.',
    },
    {
      rect: [594, 239, 140, 100],
      title: 'Decoder',
      body: 'The channel-group queries cross-attend the encoded crop, giving one token per channel group.',
    },
    {
      rect: [750, 238, 25, 95],
      title: 'Channel tokens',
      body: 'The decoder\'s output: one token per channel group.',
    },
    {
      rect: [790, 257, 86, 64],
      title: 'MLP',
      body: 'Turns every channel token into the logits of its warp parameters.',
    },
    {
      rect: [888, 58, 210, 290],
      title: 'Categorical outputs',
      body: 'One categorical distribution per warp parameter over a fixed grid, plus one bin that repeats the value applied at the previous step. Sampled while training, argmax at evaluation.',
    },
    {
      rect: [14, 414, 358, 52],
      title: 'Multiplier grid',
      body: 'Dense between take-over (\\(m = 0\\)) and identity (\\(m = 1\\)). Values in between damp a channel, values above one boost it and negative values reverse it. Every distribution starts with most of its mass on the identity, so training starts from the unwarped skill.',
    },
    {
      rect: [452, 414, 358, 52],
      title: 'Offset grid',
      body: 'A signed ladder in multiples of a step size \\(u\\) per robot (1.5 cm on the gantry), starting with most of its mass at zero.',
    },
    {
      rect: [893, 405, 200, 126],
      title: 'Sampled warp',
      body: 'The multiplier and offset of every channel, applied as \\(\\tilde z \\leftarrow m z + o\\) by the input and output warps of Figure 1.',
      link: { href: '#overview', label: 'Back to the overview (Figure 1)' },
    },
  ],
};
