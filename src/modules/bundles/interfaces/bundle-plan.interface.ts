export interface BundlePlan {
  period: 'weekly' | 'monthly';
  category: 'dapur' | 'cleaning' | 'kulkas';
  missing: string[];
  recipe?: {
    servings: number;
    sessions: number;
    minutes: number;
    ingredients: string[];
    pantry: string[];
    steps: string[];
    storage: string;
  };
}
