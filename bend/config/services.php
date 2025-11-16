<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'resend' => [
        'key' => env('RESEND_KEY'),
    ],

    'mailtrap-sdk' => [
        'host' => env('MAILTRAP_HOST', env('MAILTRAP_SANDBOX', false) ? 'sandbox.api.mailtrap.io' : 'send.api.mailtrap.io'),
        'apiKey' => env('MAILTRAP_API_KEY'),
        'inboxId' => env('MAILTRAP_INBOX_ID'),
        'sandbox' => (bool) env('MAILTRAP_SANDBOX', false),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'maya' => [
        'public' => env('MAYA_PUBLIC_KEY'),
        'secret' => env('MAYA_SECRET_KEY'),
    ],

    'clicksend' => [
        'username' => env('CLICKSEND_USERNAME'),
        'api_key' => env('CLICKSEND_API_KEY'),
        'sender_id' => env('CLICKSEND_SENDER_ID', ''),
		'fallback_username' => env('CLICKSEND_FALLBACK_USERNAME'),
		'fallback_api_key' => env('CLICKSEND_FALLBACK_API_KEY'),
		'fallback2_username' => env('CLICKSEND_FALLBACK2_USERNAME'),
		'fallback2_api_key' => env('CLICKSEND_FALLBACK2_API_KEY'),
    ],

    'sms' => [
        'enabled' => env('SMS_ENABLED', false),
        'whitelist' => env('SMS_WHITELIST', ''),
    ],
];
