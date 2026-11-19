# Privacy Policy

Last Updated: November 19th, 2026

Welcome to agentopia.town ("agentopia", "Starfish", "we", "us", or "our"). This Privacy Policy explains how we collect, use, disclose, and protect information about you through our website located at https://agentopia.town (the "Site"), the agentopia command-line tool and its plugins (the "Software"), and any related services, applications, or features offered by Starfish Software LLC (collectively, the "Services").

By accessing or using our Services, you agree to this Privacy Policy. If you do not agree with our policies and practices, please do not use our Services.

## The software runs locally

The agentopia Software observes coding-agent sessions on your own machine and records them to files on your own machine. Session recordings — including tool names, file names, and short text snippets from your sessions — are stored locally and are not transmitted to us or to any third party by the Software. Deleting the Software's local data directory removes them.

## Requests the software makes

The Software makes a few requests of its own over the internet. None of them carries your session recordings, prompts, file names, paths, or anything else from your sessions, and none carries an identifier for you or your machine. Like any request over the internet, each one reveals your IP address to the server it goes to.

- Prices. To show what your sessions cost, the Software asks for current model prices at most once a day, while its office is open in a browser. It asks agentopia.town first, and models.dev (https://models.dev) directly if agentopia.town cannot be reached. The request is a plain download with no query, and it names the Software's version, your operating system (such as macOS), and your processor type (such as arm64). We count these requests, by version, operating system and processor type, to understand roughly how many offices are in use. We do not store or log your IP address, though our hosting provider's request logs keep it for a short time. When the request goes to models.dev, models.dev's own privacy practices apply.
- Updates. To keep itself up to date, the Software asks the npm registry (https://www.npmjs.com) for its latest version every few hours, and downloads that version from npm when there is one. These requests go to npm, not to us, and npm's privacy policy applies. Setting `AGENTOPIA_AUTO_UPDATE=0` stops the Software from downloading updates on its own.

## Information we collect

Through the Site, we may collect:

- Personal Information. Personal information that you provide to us, such as your name, email address, and other contact details.
- Non-Personal Information. Non-personal information collected automatically as you navigate through the Site. This may include your IP address, browser type, operating system, and other technical information.

Apart from the IP address that its requests reveal (see [Requests the software makes](#requests-the-software-makes)), the Software does not collect or transmit personal information.

## How we use your information

We may use the information we collect for various purposes, including to:

- Provide and maintain our Services;
- Communicate with you about our Services;
- Customize and improve our Services;
- Analyze trends and user behavior;
- Protect against fraud and abuse.

## Information sharing

We may share your information with third parties for various purposes, including:

### Service providers

We may share your information with third-party service providers who help us operate our Services or assist us in providing certain features, such as website hosting and analytics.

### Legal compliance

We may disclose your information to comply with applicable laws, regulations, or legal processes, or to respond to lawful requests from government authorities.

## Your choices

You may have certain rights and choices regarding the personal information we collect about you. For example, you may opt out of certain data collection or unsubscribe from marketing communications.

## Security

We take reasonable measures to protect your information from unauthorized access, use, or disclosure. However, no method of transmission over the internet or electronic storage is completely secure.

## Changes to this privacy policy

We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the updated policy on this page.

## Contact us

If you have any questions or concerns about this Privacy Policy, please contact us at contact@agentopia.town.
