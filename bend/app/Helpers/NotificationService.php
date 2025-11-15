<?php

namespace App\Helpers;

use Illuminate\Support\Facades\Http;
use App\Models\Appointment;
use App\Models\NotificationLog;
use App\Models\SmsWhitelist;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;

class NotificationService
{
    /**
     * Generic send with SMS logging and whitelisting support.
     * Always creates a notification_logs row; decides whether to send via ClickSend based on env flags and whitelist.
     * 
     * SMS is automatically blocked during database seeding to prevent unwanted notifications.
     * Set DB_SEEDING=true environment variable during seeding operations.
     */
    public static function send(?string $to = null, string $subject = 'Notification', string $message = ''): void
    {
        Log::info('[SMS DEBUG] Starting SMS send process', [
            'to' => $to,
            'subject' => $subject,
            'message_length' => strlen($message),
        ]);

        // 1) Always create a log row
        $log = NotificationLog::create([
            'channel'    => 'sms',
            'to'         => $to ?? 'N/A',
            'message'    => $message,
            'status'     => 'pending',
            'meta'       => ['subject' => $subject],
            'created_by' => Auth::check() ? Auth::id() : null,
        ]);

        Log::info('[SMS DEBUG] Notification log created', ['log_id' => $log->id]);

        // 2) Read toggle and whitelist from config (which reads from env)
        // Using config() instead of env() directly to work with config cache
        $smsEnabledRaw = config('services.sms.enabled', false);
        $smsEnabled    = filter_var($smsEnabledRaw, FILTER_VALIDATE_BOOLEAN);
        $isSeedingRaw  = env('DB_SEEDING', false);
        $isSeeding     = filter_var($isSeedingRaw, FILTER_VALIDATE_BOOLEAN);
        $envWhitelistRaw = config('services.sms.whitelist', '');
        $envWhitelist  = array_filter(array_map('trim', explode(',', (string) $envWhitelistRaw)));
        $inEnvWhitelist = $to && in_array($to, $envWhitelist, true);
        $inDbWhitelist  = $to ? SmsWhitelist::where('phone_e164', $to)->exists() : false;

        Log::info('[SMS DEBUG] Environment and whitelist check', [
            'SMS_ENABLED_from_config' => $smsEnabledRaw,
            'SMS_ENABLED_bool' => $smsEnabled,
            'SMS_WHITELIST_from_config' => $envWhitelistRaw,
            'SMS_WHITELIST_array' => $envWhitelist,
            'DB_SEEDING_raw' => $isSeedingRaw,
            'DB_SEEDING_bool' => $isSeeding,
            'to' => $to,
            'in_env_whitelist' => $inEnvWhitelist,
            'in_db_whitelist' => $inDbWhitelist,
        ]);

        // 3) If disabled, seeding, or not whitelisted → block and log
        $blockReasons = [];
        if (!$smsEnabled) {
            $blockReasons[] = 'SMS_ENABLED is false';
        }
        if ($isSeeding) {
            $blockReasons[] = 'DB_SEEDING is true';
        }
        if (!$to) {
            $blockReasons[] = 'No recipient phone number';
        }
        if (!($inEnvWhitelist || $inDbWhitelist)) {
            $blockReasons[] = 'Phone number not whitelisted';
        }

        if (!empty($blockReasons)) {
            $reason = $isSeeding ? 'seeding' : 'blocked_sandbox';
            $log->update(['status' => $reason]);
            Log::info("[SMS DEBUG] SMS blocked: {$reason}", [
                'block_reasons' => $blockReasons,
                'to' => $to,
                'subject' => $subject,
            ]);
            return;
        }

        Log::info('[SMS DEBUG] All checks passed, proceeding to deduplication check');

        // 3.5) Deduplication check: prevent sending duplicate SMS within a short time window
        // This provides an additional safety layer beyond appointment-level checks
        if ($to && $to !== 'N/A') {
            $timeWindow = now()->subMinutes(5); // Check last 5 minutes
            $similarMessage = NotificationLog::where('channel', 'sms')
                ->where('to', $to)
                ->whereIn('status', ['sent', 'pending'])
                ->where('created_at', '>=', $timeWindow)
                ->where(function ($query) use ($message) {
                    // Check for similar messages (exact match or high similarity)
                    $query->where('message', $message)
                          ->orWhere('message', 'like', substr($message, 0, 50) . '%');
                })
                ->where('id', '!=', $log->id) // Exclude the current log
                ->exists();

            Log::info('[SMS DEBUG] Deduplication check', [
                'time_window' => $timeWindow->toDateTimeString(),
                'similar_message_found' => $similarMessage,
            ]);

            if ($similarMessage) {
                $log->update(['status' => 'duplicate']);
                Log::info("[SMS DEBUG] SMS duplicate prevented: {$subject} to {$to} (similar message sent within 5 minutes)");
                return;
            }
        }

        Log::info('[SMS DEBUG] Deduplication check passed, proceeding to ClickSend send');

        // 4) Send via ClickSend
        $username = config('services.clicksend.username');
        $apiKey = config('services.clicksend.api_key');
        $senderId = config('services.clicksend.sender_id');

        Log::info('[SMS DEBUG] ClickSend configuration check', [
            'username_set' => !empty($username),
            'api_key_set' => !empty($apiKey),
            'sender_id' => $senderId,
        ]);

        if (empty($username) || empty($apiKey)) {
            $log->update([
                'status' => 'failed',
                'error'  => 'Missing ClickSend credentials in configuration',
            ]);
            Log::error('[SMS DEBUG] Missing ClickSend credentials', [
                'username_empty' => empty($username),
                'api_key_empty' => empty($apiKey),
            ]);
            return;
        }

        try {
            // ClickSend API endpoint
            $apiUrl = 'https://rest.clicksend.com/v3/sms/send';
            
            // Prepare the request payload
            $payload = [
                'messages' => [
                    [
                        'source' => 'php',
                        'body' => $message,
                        'to' => $to,
                    ]
                ]
            ];

            // Add sender ID if provided
            if (!empty($senderId)) {
                $payload['messages'][0]['from'] = $senderId;
            }

            Log::info('[SMS DEBUG] Sending SMS via ClickSend', [
                'to' => $to,
                'from' => $senderId ?: 'default',
                'message_length' => strlen($message),
            ]);

            // Make HTTP request to ClickSend API
            $response = Http::withBasicAuth($username, $apiKey)
                ->withHeaders([
                    'Content-Type' => 'application/json',
                ])
                ->post($apiUrl, $payload);

            $responseData = $response->json();
            $statusCode = $response->status();

            Log::info('[SMS DEBUG] ClickSend API response', [
                'status_code' => $statusCode,
                'response' => $responseData,
            ]);

            if ($response->successful() && isset($responseData['response_code']) && $responseData['response_code'] === 'SUCCESS') {
                // Extract message ID from response
                $messageId = null;
                if (isset($responseData['data']['messages'][0]['message_id'])) {
                    $messageId = $responseData['data']['messages'][0]['message_id'];
                }

                $log->update([
                    'status'               => 'sent',
                    'provider_message_id'  => $messageId,
                ]);
                Log::info("[SMS DEBUG] SMS sent successfully to {$to}", [
                    'message_id' => $messageId,
                ]);
            } else {
                $errorMessage = $responseData['response_msg'] ?? 'Unknown error from ClickSend';
                $log->update([
                    'status' => 'failed',
                    'error'  => $errorMessage,
                ]);
                Log::error("[SMS DEBUG] SMS failed to {$to}", [
                    'status_code' => $statusCode,
                    'error_message' => $errorMessage,
                    'response' => $responseData,
                ]);
            }
        } catch (\Throwable $e) {
            $log->update([
                'status' => 'failed',
                'error'  => $e->getMessage(),
            ]);
            Log::error("[SMS DEBUG] SMS failed to {$to}", [
                'error_message' => $e->getMessage(),
                'error_code' => $e->getCode(),
                'error_file' => $e->getFile(),
                'error_line' => $e->getLine(),
                'error_trace' => $e->getTraceAsString(),
            ]);
        }
    }

    /**
     * Build a default reminder message that ALWAYS includes the appointment reference code.
     * If $edited is true and $custom is a non-empty string, the custom message is used.
     */
    public static function buildAppointmentReminderMessage(Appointment $appointment, ?string $custom = null, bool $edited = false): string
    {
        $userName   = optional(optional($appointment->patient)->user)->name ?? 'Patient';
        $service    = optional($appointment->service)->name ?? 'your service';
        $date       = (string) $appointment->date;
        $timeSlot   = (string) $appointment->time_slot;
        $refCode    = (string) ($appointment->reference_code ?? 'N/A');

        $default = "Hello {$userName}, this is a reminder for your dental appointment on {$date} at {$timeSlot} for {$service}. Ref: {$refCode}. Please arrive on time. – Kreative Dental Clinic";

        if ($edited && is_string($custom) && trim($custom) !== '') {
            return $custom;
        }

        return $default;
    }

    /**
     * Convenience helper: send a reminder for an appointment.
     * - Ensures the message includes the reference code (unless an edited custom message is provided).
     * - Logs to laravel.log (no real SMS).
     * Returns true if a message was "sent" (logged), false if there was no recipient.
     */
    public static function sendAppointmentReminder(Appointment $appointment, ?string $custom = null, bool $edited = false): bool
    {
        $user   = optional($appointment->patient)->user;
        $to     = $user->contact_number ?? null;

        if (!$to) {
            Log::warning('Reminder not sent: missing contact number', [
                'appointment_id' => $appointment->id,
                'reference_code' => $appointment->reference_code,
            ]);
            return false;
        }

        $message = self::buildAppointmentReminderMessage($appointment, $custom, $edited);

        // Send SMS via ClickSend (subject to whitelisting and SMS_ENABLED flag)
        self::send($to, 'Dental Appointment Reminder', $message);

        // Optional structured log line (handy for searching in logs)
        Log::info('Appointment reminder SMS sent', [
            'appointment_id' => $appointment->id,
            'reference_code' => $appointment->reference_code,
            'to'             => $to,
            'edited'         => $edited,
        ]);

        return true;
    }
}
