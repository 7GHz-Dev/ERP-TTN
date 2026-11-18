export type TruckType = "company" | "partner";

export interface Driver {
  id: string;
  peak_code: string | null;
  name: string;
  truck_no: string | null;
  truck_type: TruckType;
  phone: string | null;
  account_name: string | null;
  bank: string | null;
  account_no: string | null;
  fleet: string | null;
  job_class: string | null;
  doc_note: string | null;
  active: boolean;
}

export interface Unavailability {
  id: string;
  driver_id: string;
  start_date: string | null;
  end_date: string | null;
  note: string | null;
}

export interface Plan {
  id: string;
  plan_date: string;
  customer: string | null;
  shipping: string | null;
  source_text: string | null;
  note: string | null;
  created_at: string;
}

export interface Job {
  id: string;
  plan_id: string | null;
  plan_date: string;
  customer: string | null;
  bl_no: string | null;
  container_no: string;
  weight_doc_kg: number | null;
  weight_actual_kg: number | null;
  port: string | null;
  destination: string | null;
  job_type: string | null;
  shipping: string | null;
  driver_id: string | null;
  driver_name: string | null;
  truck_no: string | null;
  phone: string | null;
  payee_type: "บุคคล" | "นิติบุคคล" | null;
  account_name: string | null;
  bank: string | null;
  account_no: string | null;
  pickup_date: string | null;
  end_date: string | null;
  return_due_date: string | null;
  return_date: string | null;
  price: number | null;
  price_manual: boolean;
  overweight_fee: number | null;
  overnight_fee: number | null;
  other_fee: number | null;
  wh_tax: number | null;
  note: string | null;
  cancelled: boolean;
  updated_at?: string;
}

export type JobPatch = Partial<Omit<Job, "id">>;

export interface Rate {
  id: string;
  destination: string;
  truck_type: TruckType | "any";
  max_tons: number | null;
  price: number;
}

export interface Lookup {
  kind: "destination" | "job_type" | "port" | "shipping";
  value: string;
  sort: number;
}

export interface DriverStat {
  driver_id: string;
  last_job_date: string | null;
  job_count: number;
}
