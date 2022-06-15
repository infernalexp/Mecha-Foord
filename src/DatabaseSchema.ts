import { Reminder } from "./commands/ReminderCommand";

export interface DatabaseSchema {
  remind: Reminder[];
}
