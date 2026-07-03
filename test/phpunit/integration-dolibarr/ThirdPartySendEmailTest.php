<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\ThirdPartyController;
use Dolipocket\Api\Trait\SendEmailMailerRegistry;
use Societe;

/**
 * Mock mailer that captures constructor args + a faked sendfile() result, so
 * the thirdparty email endpoint can be tested without opening a real SMTP
 * socket. Resolved via SendEmailMailerRegistry::$cmailFileClass (the same
 * injection point used by the document SendEmailTrait). Distinct name from
 * DocumentSendEmailTest's mock to avoid a class redeclaration in the suite.
 */
class TpMockMailer
{
    /** @var array|null */
    public static $lastCall = null;
    /** @var bool When true, sendfile() returns false once and sets ->error. */
    public static $failNext = false;
    /** @var string */
    public $error = '';

    public function __construct(
        $subject, $to, $from, $msg,
        $filename_list = array(), $mimetype_list = array(), $mimefilename_list = array(),
        $addr_cc = "", $addr_bcc = "", $deliveryreceipt = 0, $msgishtml = 0,
        $errors_to = '', $css = '', $trackid = '', $moreinheader = '',
        $sendcontext = 'standard', $replyto = '', $upload_dir_tmp = ''
    ) {
        self::$lastCall = [
            'subject'       => $subject,
            'to'            => $to,
            'from'          => $from,
            'msg'           => $msg,
            'filename_list' => $filename_list,
            'addr_cc'       => $addr_cc,
            'addr_bcc'      => $addr_bcc,
            'msgishtml'     => $msgishtml,
            'trackid'       => $trackid,
        ];
    }

    public function sendfile()
    {
        if (self::$failNext) {
            $this->error = 'Mock SMTP refused';
            self::$failNext = false;
            return false;
        }
        return true;
    }
}

/**
 * Integration tests for the thirdparty "send email" endpoint
 * (POST /thirdparty/{id}/email).
 *
 * Covers:
 *  - Sends to the thirdparty email with NO attachment (free email).
 *  - Honours an explicit recipient override.
 *  - Rejects an invalid recipient, a missing subject, an unknown id and a
 *    user without societe.lire.
 *  - Propagates CMailFile::sendfile() failure as HTTP 500.
 */
class ThirdPartySendEmailTest extends DolibarrRealTestCase
{
    /** @var ThirdPartyController */
    private $controller;

    /** @var array<int,int> */
    private $fixtureIds = [];

    /** @var int */
    private $socId = 0;

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $conf;

        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/SendEmailTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmThirdParty.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/ThirdPartyController.php';
        require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';

        if (!isset($conf->modules) || !is_array($conf->modules)) {
            $conf->modules = array();
        }
        foreach (array('societe', 'agenda') as $mod) {
            $conf->modules[$mod] = $mod;
            if (!isset($conf->$mod)) {
                $conf->$mod = new \stdClass();
            }
            $conf->$mod->enabled = 1;
        }

        $user->admin = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        if (!isset($user->rights->societe)) {
            $user->rights->societe = new \stdClass();
        }
        $user->rights->societe->lire = 1;
        $user->rights->societe->creer = 1;
        $user->rights->societe->supprimer = 1;

        // Inject the mock mailer for the duration of the test.
        SendEmailMailerRegistry::$cmailFileClass = TpMockMailer::class;
        TpMockMailer::$lastCall = null;
        TpMockMailer::$failNext = false;

        $this->controller = new ThirdPartyController();

        $this->socId = $this->createThirdParty('cockpit-mail@example.test');
        $this->fixtureIds[] = $this->socId;
    }

    protected function tearDown(): void
    {
        global $user;

        // Restore the real mailer so other tests are unaffected.
        SendEmailMailerRegistry::$cmailFileClass = '\\CMailFile';

        foreach ($this->fixtureIds as $id) {
            $tp = new Societe($this->db);
            if ($tp->fetch($id) > 0) {
                $tp->delete($id, $user);
            }
        }
        $this->fixtureIds = [];
        parent::tearDown();
    }

    /**
     * @param string $email
     * @return int
     */
    private function createThirdParty($email): int
    {
        global $user;
        $tp = new Societe($this->db);
        $tp->name = 'SendMailTiers-' . uniqid();
        $tp->email = $email;
        $tp->client = 1;
        $tp->fournisseur = 0;
        $tp->status = 1;
        $newId = $tp->create($user);
        $this->assertGreaterThan(0, $newId, 'Fixture create() must succeed: ' . $tp->error);
        return (int) $newId;
    }

    public function testSendEmailToThirdpartyEmailWithoutAttachment(): void
    {
        list($data, $code) = $this->controller->sendEmail([
            'id'      => $this->socId,
            'subject' => 'Bonjour',
            'body'    => 'Message de test au tiers.',
        ]);

        $this->assertSame(200, $code);
        $this->assertTrue($data['ok']);
        $this->assertSame('cockpit-mail@example.test', $data['to']);
        $this->assertSame('thirdparty-' . $this->socId, $data['trackid']);
        $this->assertArrayHasKey('eventId', $data);
        $this->assertIsInt($data['eventId']);

        // The mailer was called with the right recipient/subject and NO
        // attachment (free email, not a document send).
        $call = TpMockMailer::$lastCall;
        $this->assertIsArray($call);
        $this->assertSame('cockpit-mail@example.test', $call['to']);
        $this->assertSame('Bonjour', $call['subject']);
        $this->assertSame(array(), $call['filename_list'], 'thirdparty email must have no attachment');
        $this->assertSame('thirdparty-' . $this->socId, $call['trackid']);
    }

    public function testSendEmailHonoursExplicitRecipient(): void
    {
        list($data, $code) = $this->controller->sendEmail([
            'id'      => $this->socId,
            'to'      => 'override@example.test',
            'subject' => 'Direct',
        ]);

        $this->assertSame(200, $code);
        $this->assertSame('override@example.test', $data['to']);
        $this->assertSame('override@example.test', TpMockMailer::$lastCall['to']);
    }

    public function testSendEmailRejectsInvalidRecipient(): void
    {
        list($data, $code) = $this->controller->sendEmail([
            'id'      => $this->socId,
            'to'      => 'not-an-email',
            'subject' => 'X',
        ]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('error', $data);
    }

    public function testSendEmailRejectsMissingSubject(): void
    {
        list($data, $code) = $this->controller->sendEmail([
            'id'   => $this->socId,
            'body' => 'No subject here',
        ]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('error', $data);
    }

    public function testSendEmailForbiddenWithoutSocieteLire(): void
    {
        global $user;
        $user->admin = 0;
        $user->rights->societe->lire = 0;

        list($data, $code) = $this->controller->sendEmail([
            'id'      => $this->socId,
            'subject' => 'Nope',
        ]);

        $this->assertSame(403, $code);
        $this->assertArrayHasKey('error', $data);
    }

    public function testSendEmailNotFound(): void
    {
        list($data, $code) = $this->controller->sendEmail([
            'id'      => 99999999,
            'subject' => 'Ghost',
        ]);

        $this->assertSame(404, $code);
        $this->assertArrayHasKey('error', $data);
    }

    public function testSendfileFailurePropagatesAs500(): void
    {
        TpMockMailer::$failNext = true;

        list($data, $code) = $this->controller->sendEmail([
            'id'      => $this->socId,
            'subject' => 'Will fail',
        ]);

        $this->assertSame(500, $code);
        $this->assertArrayHasKey('error', $data);
    }
}
