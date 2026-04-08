export type BusinessType = '임대' | '자체' | '민간' | '공모' | '도정';

export type MilestoneStatus =
  | '기착공'
  | '착공임박'
  | '인허가 진행중'
  | '검토중'
  | 'Drop 검토중'
  | '비주관, 관여X'
  | '기획정';

export interface MilestoneCell {
  date?: string; // 'YY.MM.DD'
  status?: MilestoneStatus;
  highlighted?: boolean; // yellow highlight
}

export interface Project {
  id: string;
  businessType: BusinessType;
  siteName: string;
  highlighted: boolean; // red border
  designVE: MilestoneCell;       // 설계VE 전략회의
  basicPlan: MilestoneCell;      // 기본계획보고 D-12M
  archReview: MilestoneCell;     // 건축심의 완 D-8M
  unitConfirm: MilestoneCell;    // 단위세대 확정 D-6M
  bizApproval: MilestoneCell;    // 사업승인 완 D-4M
  designShare: MilestoneCell;    // 설계정보 공유회의 D-2M
  constructionStart: string;     // 착공일정 D (bold)
}
