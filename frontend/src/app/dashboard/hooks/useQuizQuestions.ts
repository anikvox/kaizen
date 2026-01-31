import { useState, useEffect } from 'react';
import type { QuizQuestionWithId } from '../types';

export function useQuizQuestions() {
    const [questions, setQuestions] = useState<QuizQuestionWithId[]>([]);
    const [unansweredQuestions, setUnansweredQuestions] = useState<QuizQuestionWithId[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const mockQuestions: QuizQuestionWithId[] = [
            {
                id: 1,
                question: "Which of these is NOT a wonder?",
                option_1: "Great Pyramid of Giza",
                option_2: "Sydney Opera House",
                correct_answer: 2,
                timestamp: Date.now()
            }
        ];
        setQuestions(mockQuestions);
        setUnansweredQuestions(mockQuestions);
        setIsLoading(false);
    }, []);

    const markAsAnswered = (id: number) => {
        setUnansweredQuestions(prev => prev.filter(q => q.id !== id));
    };

    return { questions, unansweredQuestions, isLoading, markAsAnswered };
}
