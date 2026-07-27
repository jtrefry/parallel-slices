# This template schedules an existing Cloud Run Job. The job itself should be
# deployed from a quality-gated container workflow. Adapt names, IAM ownership,
# retries, deadlines, and APIs to the project before applying.

terraform {
  required_version = ">= 1.10.0, < 2.0.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.41.0"
    }
  }
}

variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "scheduler_region" {
  type = string
}

variable "cloud_run_job_name" {
  type = string
}

variable "schedule_name" {
  type = string
}

variable "schedule" {
  type = string
}

variable "time_zone" {
  type    = string
  default = "Etc/UTC"
}

resource "google_service_account" "scheduler_invoker" {
  project      = var.project_id
  account_id   = "run-job-scheduler"
  display_name = "Cloud Scheduler Cloud Run Job invoker"
}

resource "google_cloud_run_v2_job_iam_member" "scheduler_invoker" {
  project  = var.project_id
  location = var.region
  name     = var.cloud_run_job_name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler_invoker.email}"
}

resource "google_cloud_scheduler_job" "cloud_run_job" {
  project          = var.project_id
  region           = var.scheduler_region
  name             = var.schedule_name
  schedule         = var.schedule
  time_zone        = var.time_zone
  attempt_deadline = "320s"

  retry_config {
    retry_count = 3
  }

  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/projects/${var.project_id}/locations/${var.region}/jobs/${var.cloud_run_job_name}:run"
    body        = base64encode("{}")

    headers = {
      "Content-Type" = "application/json"
    }

    oauth_token {
      service_account_email = google_service_account.scheduler_invoker.email
    }
  }

  depends_on = [google_cloud_run_v2_job_iam_member.scheduler_invoker]
}
