import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { putCsv, rowsToCsv } from "./file-store";

export const saveCsvServer = createSdkMcpServer({
  name: "files",
  version: "0.1.0",
  tools: [
    tool(
      "save_csv",
      "Save AI-news rows to a CSV file. Returns a JSON object with the download URL and filename.",
      {
        filename: z.string().min(1),
        rows: z
          .array(
            z.object({
              title: z.string(),
              date: z.string(),
              excerpt: z.string(),
              link: z.string().url(),
            }),
          )
          .min(1),
      },
      async ({ filename, rows }) => {
        const safe = filename.endsWith(".csv") ? filename : `${filename}.csv`;
        const csv = rowsToCsv(rows);
        const id = putCsv(safe, csv);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                url: `/api/files/${id}`,
                filename: safe,
                count: rows.length,
              }),
            },
          ],
        };
      },
    ),
  ],
});
