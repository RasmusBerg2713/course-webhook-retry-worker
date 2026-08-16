import { z } from "zod";

export const courseEventSchema = z.object({
  event_id: z.string().min(1),
  event_type: z.enum(["course.published", "lesson.completed", "deadline.reminder"]),
  course_id: z.string().min(1),
  learner_id: z.string().min(1),
  educator_id: z.string().min(1),
  delivery_deadline: z.string().datetime(),
  webhook_url: z.string().url()
});

export type CourseEvent = z.infer<typeof courseEventSchema>;
