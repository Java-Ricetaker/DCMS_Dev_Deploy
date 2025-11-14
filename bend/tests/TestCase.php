<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Contracts\Config\Repository;

abstract class TestCase extends BaseTestCase
{
    protected function getEnvironmentSetUp($app): void
    {
        /** @var Repository $config */
        $config = $app->make('config');

        $config->set('app.key', 'base64:' . base64_encode(random_bytes(32)));
        $config->set('database.default', 'sqlite');
        $config->set('database.connections.sqlite.database', ':memory:');
    }
}
