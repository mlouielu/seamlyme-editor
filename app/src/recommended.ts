/**
 * All measurement variables directly consumed by the body figure renderer.
 * Ordered by rendering priority: coarse silhouette first, fine detail last.
 */
export const RECOMMENDED_FIGURE_MEASUREMENTS = [
  // 1. Group with common measurements
  'height',
  'bust_arc_f',
  'height_bustpoint',
  'waist_arc_f',
  'height_waist_front',
  'hip_arc_f',
  'height_hip',

  // 1. Vertical skeleton — drives overall proportions immediately
  'height_neck_back',
  'height_neck_front',
  'height_neck_side',
  'height_shoulder_tip',

  'height_armpit',
  'height_waist_side',
  'height_waist_side_to_knee',
  'height_highhip',
  'height_gluteal_fold',
  'height_knee',
  'height_calf',
  'height_ankle_high',
  'height_ankle',
  'leg_crotch_to_floor',

  // 2. Torso arcs & widths — silhouette shape
  'neck_arc_f',
  'highbust_arc_f',
  'lowbust_arc_f',
  'rib_arc_f',
  'highhip_arc_f',
  'width_bust',
  'width_waist',
  'width_hip',
  'width_shoulder',
  'neck_width',
  'neck_front_to_shoulder_tip_f',
  'shoulder_tip_to_shoulder_tip_f',
  'shoulder_tip_to_armfold_f',

  // 3. Torso circumferences
  'bust_circ',
  'highbust_circ',
  'lowbust_circ',
  'rib_circ',
  'waist_circ',
  'highhip_circ',
  'hip_circ',

  // 4. Torso vertical offsets & bust-point
  'bust_to_waist_f',
  'neck_front_to_bust_f',
  'lowbust_to_waist_f',
  'bustpoint_to_bustpoint',
  'bustpoint_to_bustpoint_half',
  'waist_to_highhip_side',
  'waist_to_hip_side',

  // 5. Leg circumferences
  'leg_thigh_upper_circ',
  'leg_thigh_mid_circ',
  'leg_knee_circ',
  'leg_knee_small_circ',
  'leg_calf_circ',
  'leg_ankle_high_circ',
  'leg_ankle_circ',

  // 6. Arm lengths
  'arm_shoulder_tip_to_elbow',
  'arm_shoulder_tip_to_elbow_bent',
  'arm_shoulder_tip_to_wrist_bent',
  'arm_armpit_to_elbow',
  'arm_elbow_to_wrist',
  'arm_elbow_to_wrist_bent',
  'arm_elbow_to_wrist_inside',

  // 7. Arm circumferences
  'arm_upper_circ',
  'arm_above_elbow_circ',
  'arm_elbow_circ',
  'arm_elbow_circ_bent',
  'arm_lower_circ',
  'arm_wrist_circ',

  // 8. Hand
  'hand_length',
  'hand_palm_length',
  'hand_palm_width',
  'hand_circ',
  'hand_palm_circ',

  // 9. Head
  'head_width',
  'head_length',
  'head_circ',
  'head_chin_to_neck_back',

  // 10. Foot
  'foot_length',
  'foot_circ',
  'foot_instep_circ',
] as const;
