import { OutputChannel } from '../../utils/outputChannel';
import * as vscode from 'vscode';
import * as nodemailer from 'nodemailer';

export class WriteActionHandler {
    private output: OutputChannel;

    constructor(output: OutputChannel) {
        this.output = output;
    }

    async sendEmail(subject: string, body: string): Promise<{ success: boolean; message: string }> {
        try {
            const config = vscode.workspace.getConfiguration('ragAgent');
            
            // Get email configuration
            const recipient = config.get<string>('emailRecipient', 'jafarsadiqe.2001@gmail.com');
            const smtpHost = config.get<string>('emailSmtpHost', 'smtp.gmail.com');
            const smtpPort = config.get<number>('emailSmtpPort', 587);
            const smtpUser = config.get<string>('emailSmtpUser', '');
            const smtpPassword = config.get<string>('emailSmtpPassword', '');
            const emailFrom = config.get<string>('emailFrom', smtpUser || 'ragagent@example.com');

            // Validate configuration
            if (!smtpUser || !smtpPassword) {
                this.output.logError('[EMAIL] SMTP credentials not configured. Please set ragAgent.emailSmtpUser and ragAgent.emailSmtpPassword in settings.');
                return { 
                    success: false, 
                    message: 'Email not configured. Please set SMTP credentials in VS Code settings (ragAgent.emailSmtpUser and ragAgent.emailSmtpPassword).' 
                };
            }

            this.output.logInfo(`[EMAIL] Sending email to ${recipient} via ${smtpHost}:${smtpPort}`);

            // Create transporter
            const transporter = nodemailer.createTransport({
                host: smtpHost,
                port: smtpPort,
                secure: smtpPort === 465, // true for 465, false for other ports
                auth: {
                    user: smtpUser,
                    pass: smtpPassword
                }
            });

            // Verify connection
            await transporter.verify();
            this.output.logInfo('[EMAIL] SMTP connection verified');

            // Send email
            const info = await transporter.sendMail({
                from: emailFrom,
                to: recipient,
                subject: subject,
                text: body,
                html: `<p>${body.replace(/\n/g, '<br>')}</p>`
            });

            this.output.logInfo(`[EMAIL] Email sent successfully. Message ID: ${info.messageId}`);
            return { 
                success: true, 
                message: `Email sent successfully to ${recipient}` 
            };
        } catch (err: any) {
            this.output.logError(`[EMAIL] Email send failed: ${err.message || err}`);
            
            // Provide helpful error messages
            let errorMessage = 'Failed to send email';
            if (err.code === 'EAUTH') {
                errorMessage = 'Authentication failed. Check your SMTP username and password (use Gmail App Password, not regular password).';
            } else if (err.code === 'ECONNECTION') {
                errorMessage = 'Connection failed. Check your SMTP host and port settings.';
            } else if (err.message) {
                errorMessage = `Email failed: ${err.message}`;
            }
            
            return { 
                success: false, 
                message: errorMessage 
            };
        }
    }

    async updateDatabase(_payload: any): Promise<{ success: boolean; message: string }> {
        try {
            await new Promise(resolve => setTimeout(resolve, 200));
            return { success: true, message: 'Database updated' };
        } catch (err: any) {
            this.output.logError(`DB update failed: ${err.message || err}`);
            return { success: false, message: 'DB update failed' };
        }
    }
}

