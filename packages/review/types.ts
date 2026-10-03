export type Category = 'source' | 'specification' | 'requirement' | 'model' | 'tool' | 'permission' | 'policy' | 'prompt' | 'dependency' | 'api' | 'data-schema' | 'deployment' | 'eval';
export interface Snapshot { sha: string; files: Record<string, string> }
export interface FieldChange { pointer: string; operation: 'added' | 'removed' | 'modified'; beforeDigest?: string; afterDigest?: string }
export interface Change { path: string; operation: 'added' | 'removed' | 'modified'; categories: Category[]; beforeDigest?: string; afterDigest?: string; fields: FieldChange[] }
export interface ReviewFinding {
  id: string; rule: string; severity: 'medium' | 'high' | 'critical'; claim: string;
  verification: 'verified' | 'inferred'; paths: string[]; requirementId?: string;
}
export interface Analysis {
  schemaVersion: 'v1alpha1'; repository: string; baseSha: string; headSha: string;
  changes: Change[]; findings: ReviewFinding[]; risk: 'low' | 'medium' | 'high' | 'critical';
  advisory: true; evals: { status: 'not-applicable'; reason: string };
}
export interface ReviewInput { repository: string; base: Snapshot; head: Snapshot }
