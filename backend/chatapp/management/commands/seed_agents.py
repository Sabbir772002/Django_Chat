"""
Django management command to seed the database with test agents and visitors
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from chatapp.models import UserRole
import logging

User = get_user_model()
logger = logging.getLogger('chatapp')


class Command(BaseCommand):
    """Seed database with initial users"""
    help = 'Seed the database with test agents and visitors'
    
    def handle(self, *args, **options):
        """Execute the command"""
        self.stdout.write('🌱 Seeding database with test users...')
        
        # Agent credentials
        agents = [
            {
                'username': 'agent_sarah',
                'email': 'sarah@agents.local',
                'password': 'Agent@Sarah123',
                'role': UserRole.AGENT
            },
            {
                'username': 'agent_john',
                'email': 'john@agents.local',
                'password': 'Agent@John456',
                'role': UserRole.AGENT
            },
            {
                'username': 'agent_mike',
                'email': 'mike@agents.local',
                'password': 'Agent@Mike789',
                'role': UserRole.AGENT
            },
        ]
        
        # Create agents
        created_count = 0
        for agent_data in agents:
            user, created = User.objects.get_or_create(
                username=agent_data['username'],
                defaults={
                    'email': agent_data['email'],
                    'role': agent_data['role'],
                    'is_active': True,
                }
            )
            
            if created:
                user.set_password(agent_data['password'])
                user.save()
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"✅ Created agent: {agent_data['username']}"
                    )
                )
                logger.info(f"Created agent: {agent_data['username']}")
            else:
                self.stdout.write(
                    self.style.WARNING(
                        f"⚠️  Agent already exists: {agent_data['username']}"
                    )
                )
        
        # Create a test visitor
        visitor, created = User.objects.get_or_create(
            username='visitor_test',
            defaults={
                'email': 'visitor@test.local',
                'role': UserRole.VISITOR,
                'is_active': True,
            }
        )
        
        if created:
            visitor.set_password('Visitor@Test123')
            visitor.save()
            self.stdout.write(
                self.style.SUCCESS('✅ Created test visitor: visitor_test')
            )
            logger.info('Created test visitor: visitor_test')
        else:
            self.stdout.write(
                self.style.WARNING('⚠️  Test visitor already exists: visitor_test')
            )
        
        self.stdout.write(
            self.style.SUCCESS(f'\n✅ Seeding complete! Created {created_count} new agents.')
        )
        self.stdout.write('\n🔐 Agent Credentials:')
        for agent_data in agents:
            self.stdout.write(f'  Username: {agent_data["username"]}, Password: {agent_data["password"]}')
        self.stdout.write(f'\n🔐 Visitor Credentials:')
        self.stdout.write(f'  Username: visitor_test, Password: Visitor@Test123')
