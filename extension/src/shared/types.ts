export interface JobData {
    title: string;
    company: string;
    description: string;
    url: string;
}

export interface AnalysisResponse {
    score: number;

    recommendation: "Apply" | "Maybe" | "Skip";

    matchedSkills: string[];

    missingSkills: string[];

    redFlags: string[];

    summary: string;
}