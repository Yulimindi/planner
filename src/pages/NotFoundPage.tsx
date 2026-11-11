import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button, EmptyState } from '../components/ui'

export default function NotFoundPage({ message = '페이지를 찾을 수 없어요.' }: { message?: string }) {
  return (
    <EmptyState
      icon={<Compass size={22} />}
      title={message}
      description="삭제되었거나 주소가 잘못되었을 수 있어요."
      action={<Link to="/"><Button>홈으로</Button></Link>}
    />
  )
}
