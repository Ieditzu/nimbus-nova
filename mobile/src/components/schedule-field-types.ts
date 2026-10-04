export type ScheduleFieldProps = {
 label: string;
 mode: "date" | "time";
 value: string;
 date?: string;
 minDate?: string;
 disabled?: boolean;
 onChange: (value: string) => void;
};
