import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Clear existing data
  console.log('Clearing existing data...');
  await prisma.audioAttention.deleteMany();
  await prisma.youtubeAttention.deleteMany();
  await prisma.imageAttention.deleteMany();
  await prisma.textAttention.deleteMany();
  console.log('✅ Existing data cleared');

  // Seed TextAttention records
  console.log('Seeding TextAttention records...');
  const textRecords = [];
  for (let i = 0; i < 50; i++) {
    const content = faker.lorem.paragraphs(faker.number.int({ min: 3, max: 10 }));
    const wordCount = content.split(/\s+/).length;
    
    textRecords.push({
      url: faker.helpers.maybe(() => faker.internet.url(), { probability: 0.7 }),
      title: faker.lorem.sentence({ min: 3, max: 8 }),
      content: content,
      wordCount: wordCount,
      readingTime: Math.ceil(wordCount / 200), // Average reading speed
      timestamp: faker.date.between({ 
        from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
        to: new Date() 
      }),
    });
  }
  await prisma.textAttention.createMany({ data: textRecords });
  console.log(`✅ Created ${textRecords.length} TextAttention records`);

  // Seed ImageAttention records
  console.log('Seeding ImageAttention records...');
  const imageRecords = [];
  for (let i = 0; i < 40; i++) {
    const width = faker.number.int({ min: 800, max: 4000 });
    const height = faker.number.int({ min: 600, max: 3000 });
    
    imageRecords.push({
      url: faker.image.url(),
      title: faker.lorem.sentence({ min: 2, max: 6 }),
      description: faker.helpers.maybe(() => faker.lorem.paragraph(), { probability: 0.6 }),
      width: width,
      height: height,
      fileSize: faker.number.int({ min: 100000, max: 10000000 }), // 100KB to 10MB
      mimeType: faker.helpers.arrayElement(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
      timestamp: faker.date.between({ 
        from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        to: new Date() 
      }),
    });
  }
  await prisma.imageAttention.createMany({ data: imageRecords });
  console.log(`✅ Created ${imageRecords.length} ImageAttention records`);

  // Seed YoutubeAttention records
  console.log('Seeding YoutubeAttention records...');
  const youtubeRecords = [];
  for (let i = 0; i < 30; i++) {
    // Generate a realistic YouTube video ID (11 characters)
    const videoId = faker.string.alphanumeric({ length: 11, casing: 'mixed' });
    
    youtubeRecords.push({
      id: videoId,
      title: faker.lorem.sentence({ min: 3, max: 10 }),
      channelName: faker.helpers.maybe(() => faker.person.fullName(), { probability: 0.8 }),
      duration: faker.number.int({ min: 60, max: 7200 }), // 1 minute to 2 hours
      thumbnailUrl: faker.helpers.maybe(
        () => `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        { probability: 0.9 }
      ),
      watchedAt: faker.date.between({ 
        from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        to: new Date() 
      }),
    });
  }
  
  // Use individual creates for YouTube to handle potential ID conflicts
  for (const record of youtubeRecords) {
    try {
      await prisma.youtubeAttention.create({ data: record });
    } catch (error) {
      console.warn(`⚠️  Skipped duplicate YouTube video: ${record.id}`);
    }
  }
  console.log(`✅ Created ${youtubeRecords.length} YoutubeAttention records`);

  // Seed AudioAttention records
  console.log('Seeding AudioAttention records...');
  const audioRecords = [];
  for (let i = 0; i < 35; i++) {
    const duration = faker.number.int({ min: 180, max: 3600 }); // 3 minutes to 1 hour
    
    audioRecords.push({
      url: faker.helpers.maybe(() => faker.internet.url(), { probability: 0.6 }),
      title: faker.helpers.arrayElement([
        faker.music.songName(),
        faker.lorem.sentence({ min: 3, max: 8 }),
      ]),
      artist: faker.helpers.maybe(() => faker.person.fullName(), { probability: 0.7 }),
      duration: duration,
      fileSize: faker.number.int({ min: 1000000, max: 50000000 }), // 1MB to 50MB
      mimeType: faker.helpers.arrayElement(['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4']),
      timestamp: faker.date.between({ 
        from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        to: new Date() 
      }),
    });
  }
  await prisma.audioAttention.createMany({ data: audioRecords });
  console.log(`✅ Created ${audioRecords.length} AudioAttention records`);

  // Summary
  const counts = {
    textAttention: await prisma.textAttention.count(),
    imageAttention: await prisma.imageAttention.count(),
    youtubeAttention: await prisma.youtubeAttention.count(),
    audioAttention: await prisma.audioAttention.count(),
  };

  console.log('\n🎉 Database seeding completed successfully!');
  console.log('📊 Summary:');
  console.log(`   - TextAttention: ${counts.textAttention} records`);
  console.log(`   - ImageAttention: ${counts.imageAttention} records`);
  console.log(`   - YoutubeAttention: ${counts.youtubeAttention} records`);
  console.log(`   - AudioAttention: ${counts.audioAttention} records`);
  console.log(`   - Total: ${Object.values(counts).reduce((a, b) => a + b, 0)} records\n`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
