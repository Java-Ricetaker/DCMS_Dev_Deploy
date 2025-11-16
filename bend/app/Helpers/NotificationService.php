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
		 * Low-level helper to send via ClickSend.
		 */
		private static function sendViaClickSend(array $payload, string $username, string $apiKey)
		{
			$apiUrl = 'https://rest.clicksend.com/v3/sms/send';
			return Http::withBasicAuth($username, $apiKey)
				->withHeaders([
					'Content-Type' => 'application/json',
				])
				->post($apiUrl, $payload);
		}

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
		$fallbackUsername = config('services.clicksend.fallback_username');
		$fallbackApiKey = config('services.clicksend.fallback_api_key');
		$fallback2Username = config('services.clicksend.fallback2_username');
		$fallback2ApiKey = config('services.clicksend.fallback2_api_key');

        Log::info('[SMS DEBUG] ClickSend configuration check', [
            'username_set' => !empty($username),
            'api_key_set' => !empty($apiKey),
            'sender_id' => $senderId,
				'fallback_username_set' => !empty($fallbackUsername),
				'fallback_api_key_set' => !empty($fallbackApiKey),
				'fallback2_username_set' => !empty($fallback2Username),
				'fallback2_api_key_set' => !empty($fallback2ApiKey),
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

				// Attempt with primary credentials
				$response = self::sendViaClickSend($payload, $username, $apiKey);

            $responseData = $response->json();
            $statusCode = $response->status();

            Log::info('[SMS DEBUG] ClickSend API response', [
                'status_code' => $statusCode,
                'response' => $responseData,
            ]);

				// Precompute basic error markers for gating fallback attempts
				$primaryErrorMsg = $responseData['response_msg'] ?? '';
				$insufficientCredit = is_string($primaryErrorMsg) && stripos($primaryErrorMsg, 'credit') !== false;
				$authFailure = in_array((int) $statusCode, [401, 403], true);

				$primarySuccess = $response->successful() && isset($responseData['response_code']) && $responseData['response_code'] === 'SUCCESS';

				if ($primarySuccess) {
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
					// Only try fallback on specific recoverable cases (credit/auth) to avoid duplicate sends
					$shouldTryFallback = !empty($fallbackUsername) && !empty($fallbackApiKey) && ($insufficientCredit || $authFailure);

					if ($shouldTryFallback) {
						Log::warning('[SMS DEBUG] Primary ClickSend attempt failed; trying fallback credentials', [
							'status_code' => $statusCode,
							'primary_response' => $responseData,
							'detected_insufficient_credit' => $insufficientCredit,
							'detected_auth_failure' => $authFailure,
						]);

						$fbResponse = self::sendViaClickSend($payload, $fallbackUsername, $fallbackApiKey);
						$fbData = $fbResponse->json();
						$fbStatus = $fbResponse->status();
						$fallbackSuccess = $fbResponse->successful() && isset($fbData['response_code']) && $fbData['response_code'] === 'SUCCESS';

						if ($fallbackSuccess) {
							$messageId = $fbData['data']['messages'][0]['message_id'] ?? null;
							$existingMeta = is_array($log->meta ?? null) ? $log->meta : [];
							$log->update([
								'status' => 'sent',
								'provider_message_id' => $messageId,
								'meta' => array_merge($existingMeta, [
									'fallback_used' => true,
									'fallback_tier' => 1,
									'primary_error' => $primaryErrorMsg ?: 'Unknown',
								]),
							]);
							Log::info("[SMS DEBUG] SMS sent successfully via fallback to {$to}", [
								'message_id' => $messageId,
							]);
							return;
						}

						// First fallback failed — optionally try fallback 2 if configured and gated
						$fbErrorMessage = $fbData['response_msg'] ?? 'Unknown error from ClickSend (fallback 1)';
						$canTrySecondFallback = !empty($fallback2Username) && !empty($fallback2ApiKey) && ($insufficientCredit || $authFailure);

						if ($canTrySecondFallback) {
							Log::warning('[SMS DEBUG] Fallback 1 failed; trying fallback 2 credentials', [
								'fallback1_status_code' => $fbStatus,
								'fallback1_response' => $fbData,
							]);

							$fb2Response = self::sendViaClickSend($payload, $fallback2Username, $fallback2ApiKey);
							$fb2Data = $fb2Response->json();
							$fb2Status = $fb2Response->status();
							$fallback2Success = $fb2Response->successful() && isset($fb2Data['response_code']) && $fb2Data['response_code'] === 'SUCCESS';

							if ($fallback2Success) {
								$messageId = $fb2Data['data']['messages'][0]['message_id'] ?? null;
								$existingMeta = is_array($log->meta ?? null) ? $log->meta : [];
								$log->update([
									'status' => 'sent',
									'provider_message_id' => $messageId,
									'meta' => array_merge($existingMeta, [
										'fallback_used' => true,
										'fallback_tier' => 2,
										'primary_error' => $primaryErrorMsg ?: 'Unknown',
										'fallback1_error' => $fbErrorMessage,
									]),
								]);
								Log::info("[SMS DEBUG] SMS sent successfully via fallback 2 to {$to}", [
									'message_id' => $messageId,
								]);
								return;
							}

							// Second fallback failed too
							$fb2ErrorMessage = $fb2Data['response_msg'] ?? 'Unknown error from ClickSend (fallback 2)';
							$existingMeta = is_array($log->meta ?? null) ? $log->meta : [];
							$log->update([
								'status' => 'failed',
								'error'  => $fb2ErrorMessage,
								'meta'   => array_merge($existingMeta, [
									'fallback_used' => true,
									'fallback_tier' => 2,
									'primary_error' => $primaryErrorMsg ?: 'Unknown',
									'fallback1_error' => $fbErrorMessage,
								]),
							]);
							Log::error("[SMS DEBUG] SMS failed via fallback 2 to {$to}", [
								'primary_status_code' => $statusCode,
								'primary_response' => $responseData,
								'fallback1_status_code' => $fbStatus,
								'fallback1_response' => $fbData,
								'fallback2_status_code' => $fb2Status,
								'fallback2_response' => $fb2Data,
							]);
							return;
						}

						// No second fallback configured or gating prevented it
						$errorMessage = $fbErrorMessage;
						$existingMeta = is_array($log->meta ?? null) ? $log->meta : [];
						$log->update([
							'status' => 'failed',
							'error'  => $errorMessage,
							'meta'   => array_merge($existingMeta, [
								'fallback_used' => true,
								'fallback_tier' => 1,
								'primary_error' => $primaryErrorMsg ?: 'Unknown',
							]),
						]);
						Log::error("[SMS DEBUG] SMS failed via fallback 1 to {$to}", [
							'primary_status_code' => $statusCode,
							'primary_response' => $responseData,
							'fallback1_status_code' => $fbStatus,
							'fallback1_response' => $fbData,
						]);
						return;
					}

					// No fallback configured or not attempted
					$errorMessage = $primaryErrorMsg ?: 'Unknown error from ClickSend';
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
