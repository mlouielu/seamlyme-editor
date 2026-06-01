/**
 * Direct inputs consumed by the generated body figure.
 * Default-template formulas are intentionally excluded.
 */
export const RECOMMENDED_FIGURE_MEASUREMENTS = [
  // 1. Coarse silhouette: enough to reveal a recognizable torso and legs quickly
  'height',
  'height_neck_back',
  'height_bustpoint',
  'height_waist_side',
  'height_highhip',
  'height_hip',
  'leg_crotch_to_floor',
  'bust_arc_f',
  'waist_arc_f',
  'hip_arc_f',
  'height_gluteal_fold',
  'height_knee',
  'height_calf',
  'height_ankle_high',
  'height_ankle',
  'leg_thigh_upper_circ',
  'leg_thigh_mid_circ',
  'leg_knee_circ',
  'leg_calf_circ',
  'leg_ankle_high_circ',
  'leg_ankle_circ',

  // 2. Torso detail: add missing guide lines and improve silhouette projection
  'height_neck_front',
  'height_neck_side',
  'height_shoulder_tip',
  'neck_front_to_shoulder_tip_f',
  'shoulder_tip_to_shoulder_tip_f',
  'height_armpit',
  'height_waist_front',
  'neck_arc_f',
  'neck_width',
  'highbust_arc_f',
  'lowbust_arc_f',
  'rib_arc_f',
  'highhip_arc_f',
  'width_bust',
  'width_waist',
  'width_hip',
  'bust_circ',
  'waist_circ',
  'hip_circ',

  // 3. Neck, shoulder, and bust-point refinements
  'width_shoulder',
  'neck_side_to_waist_f',
  'neck_side_to_waist_side_f',
  'neck_front_to_highbust_f',
  'neck_front_to_bust_f',
  'lowbust_to_waist_f',
  'bustpoint_to_bustpoint',

  // 4. Arms and hands
  'arm_shoulder_tip_to_wrist',
  'arm_shoulder_tip_to_elbow',
  'body_armfold_circ',
  'arm_elbow_circ_bent',
  'arm_wrist_circ',
  'hand_length',
  'arm_armpit_to_wrist',
  'arm_shoulder_tip_to_wrist_bent',
  'arm_shoulder_tip_to_elbow_bent',

  // 5. Feet
  'foot_length',
  'foot_circ',

  // 6. Final refinements
  'head_width',
  'body_bust_circ',
] as const;
