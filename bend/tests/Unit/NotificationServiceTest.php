<?php

namespace Tests\Unit;

use App\Helpers\NotificationService;
use App\Models\NotificationLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class NotificationServiceTest extends TestCase
{
	use RefreshDatabase;

	protected function setUp(): void
	{
		parent::setUp();

		// Enable SMS and whitelist the test recipient to bypass sandbox blocks
		Config::set('services.sms.enabled', true);
		Config::set('services.sms.whitelist', '+639111111111');

		// Configure primary and fallbacks
		Config::set('services.clicksend.username', 'u1');
		Config::set('services.clicksend.api_key', 'k1');
		Config::set('services.clicksend.fallback_username', 'u2');
		Config::set('services.clicksend.fallback_api_key', 'k2');
		Config::set('services.clicksend.fallback2_username', 'u3');
		Config::set('services.clicksend.fallback2_api_key', 'k3');
	}

	private function buildAuthHeader(string $user, string $key): string
	{
		return 'Basic ' . base64_encode($user . ':' . $key);
	}

	public function test_primary_success_no_fallback()
	{
		$calls = 0;
		$auths = [];

		Http::fake([
			'https://rest.clicksend.com/v3/sms/send' => function ($request) use (&$calls, &$auths) {
				$calls++;
				$authHeader = $request->header('Authorization');
				$auths[] = is_array($authHeader) ? ($authHeader[0] ?? '') : (string) $authHeader;
				// Simulate SUCCESS
				return Http::response([
					'response_code' => 'SUCCESS',
					'data' => ['messages' => [['message_id' => 'MID1']]],
				], 200);
			},
		]);

		NotificationService::send('+639111111111', 'Test', 'hello world');

		$this->assertEquals(1, $calls, 'Only one provider request should be made');
		$this->assertEquals($this->buildAuthHeader('u1', 'k1'), $auths[0]);

		$log = NotificationLog::first();
		$this->assertNotNull($log);
		$this->assertEquals('sent', $log->status);
		$this->assertNull(optional($log->meta)['fallback_used'] ?? null);
	}

	public function test_primary_credit_failure_fallback1_success()
	{
		$call = 0;
		$auths = [];

		Http::fake([
			'https://rest.clicksend.com/v3/sms/send' => function ($request) use (&$call, &$auths) {
				$authHeader = $request->header('Authorization');
				$auths[] = is_array($authHeader) ? ($authHeader[0] ?? '') : (string) $authHeader;
				$call++;
				if ($call === 1) {
					// Primary: 200 but FAILURE with credit message
					return Http::response([
						'response_code' => 'FAILURE',
						'response_msg' => 'Insufficient credit balance',
					], 200);
				}
				// Fallback 1: SUCCESS
				return Http::response([
					'response_code' => 'SUCCESS',
					'data' => ['messages' => [['message_id' => 'MID2']]],
				], 200);
			},
		]);

		NotificationService::send('+639111111111', 'Test', 'hello world');

		$this->assertCount(2, $auths);
		$this->assertEquals($this->buildAuthHeader('u1', 'k1'), $auths[0]);
		$this->assertEquals($this->buildAuthHeader('u2', 'k2'), $auths[1]);

		$log = NotificationLog::first();
		$this->assertEquals('sent', $log->status);
		$this->assertTrue(optional($log->meta)['fallback_used'] ?? false);
		$this->assertEquals(1, optional($log->meta)['fallback_tier'] ?? null);
	}

	public function test_primary_auth_failure_fallback1_success()
	{
		$call = 0;
		$auths = [];

		Http::fake([
			'https://rest.clicksend.com/v3/sms/send' => function ($request) use (&$call, &$auths) {
				$authHeader = $request->header('Authorization');
				$auths[] = is_array($authHeader) ? ($authHeader[0] ?? '') : (string) $authHeader;
				$call++;
				if ($call === 1) {
					// Primary: 401 Unauthorized
					return Http::response([
						'response_code' => 'FAILURE',
						'response_msg' => 'Unauthorized',
					], 401);
				}
				// Fallback 1: SUCCESS
				return Http::response([
					'response_code' => 'SUCCESS',
					'data' => ['messages' => [['message_id' => 'MID3']]],
				], 200);
			},
		]);

		NotificationService::send('+639111111111', 'Test', 'hello world');

		$this->assertCount(2, $auths);
		$this->assertEquals($this->buildAuthHeader('u1', 'k1'), $auths[0]);
		$this->assertEquals($this->buildAuthHeader('u2', 'k2'), $auths[1]);

		$log = NotificationLog::first();
		$this->assertEquals('sent', $log->status);
		$this->assertTrue(optional($log->meta)['fallback_used'] ?? false);
		$this->assertEquals(1, optional($log->meta)['fallback_tier'] ?? null);
	}

	public function test_primary_credit_failure_fallback1_auth_failure_fallback2_success()
	{
		$call = 0;
		$auths = [];

		Http::fake([
			'https://rest.clicksend.com/v3/sms/send' => function ($request) use (&$call, &$auths) {
				$authHeader = $request->header('Authorization');
				$auths[] = is_array($authHeader) ? ($authHeader[0] ?? '') : (string) $authHeader;
				$call++;
				if ($call === 1) {
					// Primary: credit failure
					return Http::response([
						'response_code' => 'FAILURE',
						'response_msg' => 'Insufficient credit',
					], 200);
				} elseif ($call === 2) {
					// Fallback 1: auth failure
					return Http::response([
						'response_code' => 'FAILURE',
						'response_msg' => 'Unauthorized',
					], 401);
				}
				// Fallback 2: success
				return Http::response([
					'response_code' => 'SUCCESS',
					'data' => ['messages' => [['message_id' => 'MID4']]],
				], 200);
			},
		]);

		NotificationService::send('+639111111111', 'Test', 'hello world');

		$this->assertCount(3, $auths);
		$this->assertEquals($this->buildAuthHeader('u1', 'k1'), $auths[0]);
		$this->assertEquals($this->buildAuthHeader('u2', 'k2'), $auths[1]);
		$this->assertEquals($this->buildAuthHeader('u3', 'k3'), $auths[2]);

		$log = NotificationLog::first();
		$this->assertEquals('sent', $log->status);
		$this->assertTrue(optional($log->meta)['fallback_used'] ?? false);
		$this->assertEquals(2, optional($log->meta)['fallback_tier'] ?? null);
	}

	public function test_primary_server_error_no_fallback_attempted()
	{
		$requests = 0;

		Http::fake([
			'https://rest.clicksend.com/v3/sms/send' => function () use (&$requests) {
				$requests++;
				// Non-credit, non-auth error (e.g., 500)
				return Http::response([
					'response_code' => 'FAILURE',
					'response_msg' => 'Internal server error',
				], 500);
			},
		]);

		NotificationService::send('+639111111111', 'Test', 'hello world');

		$this->assertEquals(1, $requests, 'Should not attempt fallback on non-gated errors');

		$log = NotificationLog::first();
		$this->assertEquals('failed', $log->status);
		$this->assertNull(optional($log->meta)['fallback_used'] ?? null);
	}
}

