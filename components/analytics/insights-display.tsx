"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface ClusteredQuestion {
  question: string
  count: number
  sessions: string[]
  topic?: string
}

interface Insights {
  summary: string
  keyFindings: string[]
  recommendations?: string[]
}

interface InsightsDisplayProps {
  clusteredQuestions: ClusteredQuestion[]
  extractedTopics: string[]
  insights: Insights | null
}

export function InsightsDisplay({
  clusteredQuestions,
  extractedTopics,
  insights,
}: InsightsDisplayProps) {
  return (
    <div className="space-y-6">
      {insights && (
        <Card>
          <CardHeader>
            <CardTitle>Insights</CardTitle>
            <CardDescription>AI-generated insights from this session</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Summary</h4>
              <p className="text-muted-foreground">{insights.summary}</p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Key Findings</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                {insights.keyFindings.map((finding, index) => (
                  <li key={index}>{finding}</li>
                ))}
              </ul>
            </div>
            {insights.recommendations && insights.recommendations.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Recommendations</h4>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  {insights.recommendations.map((rec, index) => (
                    <li key={index}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {extractedTopics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Extracted Topics</CardTitle>
            <CardDescription>Key topics discussed in this session</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {extractedTopics.map((topic, index) => (
                <Badge key={index} variant="secondary">
                  {topic}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {clusteredQuestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Clustered Questions</CardTitle>
            <CardDescription>Questions asked during the session, grouped by similarity</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  {clusteredQuestions.some((q) => q.topic) && <TableHead>Topic</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {clusteredQuestions.map((question, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{question.question}</TableCell>
                    <TableCell className="text-right">{question.count}</TableCell>
                    <TableCell className="text-right">{question.sessions.length}</TableCell>
                    {clusteredQuestions.some((q) => q.topic) && (
                      <TableCell>
                        {question.topic && <Badge variant="outline">{question.topic}</Badge>}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
