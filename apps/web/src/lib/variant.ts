import { getTasks, getTopics, type Task } from "@/lib/content";

export async function generateVariant(): Promise<Task[]> {
  const topics = await getTopics();
  return Promise.all(
    topics.map(async (topic) => {
      const tasks = await getTasks(topic.slug);
      if (tasks.length === 0) {
        throw new Error(
          `no published tasks for slot ${topic.slot} (${topic.slug})`,
        );
      }
      return tasks[Math.floor(Math.random() * tasks.length)];
    }),
  );
}
