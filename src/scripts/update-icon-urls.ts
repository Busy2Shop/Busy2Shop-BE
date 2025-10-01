import sequelize from '../models';
import FeaturedPromotion from '../models/featuredPromotion.model';

const iconUrlMap: Record<string, string> = {
    'Computer Village': 'https://cdn-icons-png.flaticon.com/512/2972/2972351.png',
    'Alaba International': 'https://cdn-icons-png.flaticon.com/512/2913/2913133.png',
    'Balogun Market': 'https://cdn-icons-png.flaticon.com/512/2331/2331970.png',
    'Trade Fair': 'https://cdn-icons-png.flaticon.com/512/3227/3227786.png',
    'Laptops': 'https://cdn-icons-png.flaticon.com/512/3474/3474360.png',
    'Food Items': 'https://cdn-icons-png.flaticon.com/512/1046/1046784.png',
};

async function updatePromotions() {
    try {
        console.log('🔄 Updating featured promotions with icon URLs...\n');

        const allPromotions = await FeaturedPromotion.findAll();
        console.log(`Found ${allPromotions.length} promotions in database\n`);

        for (const promo of allPromotions) {
            for (const [titleKeyword, iconUrl] of Object.entries(iconUrlMap)) {
                if (promo.title.includes(titleKeyword)) {
                    await promo.update({ iconUrl });
                    console.log(`✅ Updated: "${promo.title}" -> ${iconUrl}`);
                    break;
                }
            }
        }

        console.log('\n🎉 Icon URLs updated successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error updating promotions:', error);
        process.exit(1);
    }
}

updatePromotions();
