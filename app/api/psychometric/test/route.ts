import { NextResponse } from "next/server";
import { calculateBigFiveScore } from "@/lib/calculateBigFiveScore";

export async function GET() {
  const mockQuestions = [
    { id: "q1", trait: "openness", polarity: 1, question_text: "test" },
    { id: "q2", trait: "conscientiousness", polarity: 1, question_text: "test" },
    { id: "q3", trait: "extraversion", polarity: 1, question_text: "test" },
    { id: "q4", trait: "agreeableness", polarity: 1, question_text: "test" },
    { id: "q5", trait: "neuroticism", polarity: 1, question_text: "test" },
  ] as const;

  const mockAnswers = {
    q1: 5,
    q2: 4,
    q3: 3,
    q4: 2,
    q5: 1,
  };

  const scores = calculateBigFiveScore(
    mockAnswers,
    mockQuestions as any
  );

  return NextResponse.json(scores);
}
