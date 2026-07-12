import { getTasks, getTopics, type Task } from "@/lib/content";

export async function generateVariant(): Promise<Task[]> {
  const topics = await getTopics();
  const picks = await Promise.all(
    topics.map(async (topic) => {
      const tasks = await getTasks(topic.slug);
      return tasks[Math.floor(Math.random() * tasks.length)];
    }),
  );
  return picks.filter(Boolean);
}
