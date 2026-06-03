export interface RecommendedGroup {
  label: string;
  items: string[];
}

export const RECOMMENDED_GROUPS: RecommendedGroup[] = [
  {
    label: 'Start here',
    items: [
      'height',
      'bust_circ',
      'bust_arc_f',
      'height_bustpoint',
      'waist_circ',
      'waist_arc_f',
      'height_waist_front',
      'hip_circ',
      'hip_arc_f',
      'height_hip',
    ],
  },
  {
    label: 'Head',
    items: [
      'head_circ',
      'head_length',
    ],
  },
  {
    label: 'Upper body',
    items: [
      'shoulder_length',
      'shoulder_tip_to_shoulder_tip_f',
      'height_shoulder_tip',
      'neck_arc_f',
      'neck_circ',
      'neck_mid_circ',
      'height_neck_front',
      'height_neck_side',
      'height_neck_back',
    ],
  },
  {
    label: 'Lower body',
    items: [
      'leg_crotch_to_floor',
      'leg_thigh_upper_circ',
      'leg_thigh_mid_circ',
      'leg_knee_circ',
      'leg_calf_circ',
      'leg_ankle_circ',
      'height_knee',
      'height_calf',
      'height_ankle',
      'foot_length',
    ],
  },
  {
    label: 'Arm',
    items: [
      'shoulder_tip_to_armfold_f',
      'arm_upper_circ',
      'arm_shoulder_tip_to_wrist',
      'arm_shoulder_tip_to_elbow',
      'arm_armpit_to_wrist',
      'arm_armpit_to_elbow',
      'arm_elbow_circ',
      'arm_wrist_circ',
    ],
  },
  {
    label: 'Hand',
    items: [
      'hand_length',
      'hand_palm_width',
      'hand_circ',
    ],
  },
  {
    label: 'Foot',
    items: [
      'foot_circ',
      'foot_instep_circ',
    ],
  },
  {
    label: 'Vertical Details',
    items: [
      'neck_front_to_highbust_f',
      'highbust_circ',
      'highbust_arc_f',
      'bustpoint_to_bustpoint',
      'lowbust_to_waist_f',
      'lowbust_circ',
      'lowbust_arc_f',
      'rib_to_waist_side',
      'rib_circ',
      'rib_arc_f',
      'height_waist_side',
      'height_highhip',
      'highhip_circ',
      'highhip_arc_f',
      'height_gluteal_fold',
      'height_ankle_high',
    ],
  },
  {
    label: 'Bent Arm',
    items: [
      'arm_shoulder_tip_to_elbow_bent',
      'arm_shoulder_tip_to_wrist_bent',
      'arm_elbow_circ_bent',
    ],
  },
  {
    label: 'Arm Details',
    items: [
      'arm_above_elbow_circ',
      'arm_lower_circ',
    ],
  },
  {
    label: 'Leg Details',
    items: [
      'leg_knee_small_circ',
      'leg_ankle_high_circ',
    ],
  },
  {
    label: 'Direct Width',
    items: [
      'width_bust',
      'width_waist',
      'width_hip',
      'width_shoulder',
      'neck_width',
    ],
  },
];

export const RECOMMENDED_FIGURE_MEASUREMENTS = RECOMMENDED_GROUPS.flatMap(g => g.items);

/** Map from measurement name to its group label, for O(1) lookup. */
export const RECOMMENDED_GROUP_BY_NAME: Record<string, string> = {};
for (const group of RECOMMENDED_GROUPS) {
  for (const name of group.items) {
    RECOMMENDED_GROUP_BY_NAME[name] = group.label;
  }
}
